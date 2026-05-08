import admin from "firebase-admin";
import type { PaginatedResult, SubscriptionDocument } from "../types/novel.js";
import {
  ConflictError,
  NotFoundError,
  PaymentRequiredError,
  ValidationError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getChapter } from "./chapter.js";
import { getFirestore } from "./firebase.js";
import { getNovel } from "./novel.js";

function buildSubscriptionId(userId: string, novelId: string, chapterIndex: number): string {
  return `${userId}::${novelId}::${chapterIndex}`;
}

function subscriptionDocToData(
  id: string,
  data: admin.firestore.DocumentData,
): SubscriptionDocument {
  return {
    id,
    user_id: data.user_id,
    novel_id: data.novel_id,
    chapter_index: data.chapter_index,
    type: data.type,
    credits_paid: data.credits_paid,
    subscribed_at: data.subscribed_at,
  };
}

export async function checkSubscriptionAccess(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<boolean> {
  const db = getFirestore();

  // Check novel-level subscription (whole novel)
  const novelSubId = buildSubscriptionId(userId, novelId, -1);
  const novelSub = await db.collection("subscriptions").doc(novelSubId).get();
  if (novelSub.exists) return true;

  // Check chapter-level subscription
  const chapterSubId = buildSubscriptionId(userId, novelId, chapterIndex);
  const chapterSub = await db.collection("subscriptions").doc(chapterSubId).get();
  return chapterSub.exists;
}

export async function getUserSubscriptionsForNovel(
  userId: string,
  novelId: string,
): Promise<{ hasNovelSub: boolean; subscribedChapterIndices: Set<number> }> {
  const db = getFirestore();

  const snapshot = await db
    .collection("subscriptions")
    .where("user_id", "==", userId)
    .where("novel_id", "==", novelId)
    .get();

  let hasNovelSub = false;
  const subscribedChapterIndices = new Set<number>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.chapter_index === -1) {
      hasNovelSub = true;
    } else {
      subscribedChapterIndices.add(data.chapter_index);
    }
  }

  return { hasNovelSub, subscribedChapterIndices };
}

export async function subscribeChapter(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<{ subscription: SubscriptionDocument; credits_remaining: number }> {
  const db = getFirestore();

  // Validate chapter exists and is paid
  const chapter = await getChapter(novelId, chapterIndex);
  if (chapter.access_type !== "paid") {
    throw new ValidationError("This chapter is not available for subscription");
  }

  if (chapter.price <= 0) {
    throw new ValidationError("Chapter price must be greater than 0");
  }

  // Check duplicate subscription (fast-fail)
  const existingNovelSub = await db
    .collection("subscriptions")
    .doc(buildSubscriptionId(userId, novelId, -1))
    .get();
  if (existingNovelSub.exists) {
    throw new ConflictError("You have already subscribed to this novel");
  }

  const existingChapterSub = await db
    .collection("subscriptions")
    .doc(buildSubscriptionId(userId, novelId, chapterIndex))
    .get();
  if (existingChapterSub.exists) {
    throw new ConflictError("You have already subscribed to this chapter");
  }

  // Atomic transaction: deduct credits + create subscription
  const now = new Date().toISOString();
  const price = chapter.price;

  const result = await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw new NotFoundError("User not found");
    }

    const credits = userDoc.data()?.credits || 0;
    if (credits < price) {
      throw new PaymentRequiredError("Insufficient credits", {
        required: price,
        available: credits,
      });
    }

    // Deduct credits
    transaction.update(userRef, {
      credits: admin.firestore.FieldValue.increment(-price),
      updated_at: now,
    });

    // Create subscription
    const subId = buildSubscriptionId(userId, novelId, chapterIndex);
    const subRef = db.collection("subscriptions").doc(subId);
    const subData = {
      user_id: userId,
      novel_id: novelId,
      chapter_index: chapterIndex,
      type: "chapter" as const,
      credits_paid: price,
      subscribed_at: now,
    };
    transaction.set(subRef, subData);

    return { credits_remaining: credits - price, subData };
  });

  logger.info("Chapter subscribed", { userId, novelId, chapterIndex, price });

  return {
    subscription: subscriptionDocToData(
      buildSubscriptionId(userId, novelId, chapterIndex),
      result.subData,
    ),
    credits_remaining: result.credits_remaining,
  };
}

export async function subscribeNovel(
  userId: string,
  novelId: string,
): Promise<{ subscription: SubscriptionDocument; credits_remaining: number }> {
  const db = getFirestore();

  // Validate novel exists and has a price
  const novel = await getNovel(novelId);
  if (novel.price === null || novel.price <= 0) {
    throw new ValidationError("This novel is not available for whole-novel subscription");
  }

  // Check duplicate subscription (fast-fail)
  const existingNovelSub = await db
    .collection("subscriptions")
    .doc(buildSubscriptionId(userId, novelId, -1))
    .get();
  if (existingNovelSub.exists) {
    throw new ConflictError("You have already subscribed to this novel");
  }

  // Atomic transaction: deduct credits + create subscription
  const now = new Date().toISOString();
  const price = novel.price;

  const result = await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw new NotFoundError("User not found");
    }

    const credits = userDoc.data()?.credits || 0;
    if (credits < price) {
      throw new PaymentRequiredError("Insufficient credits", {
        required: price,
        available: credits,
      });
    }

    // Deduct credits
    transaction.update(userRef, {
      credits: admin.firestore.FieldValue.increment(-price),
      updated_at: now,
    });

    // Create subscription
    const subId = buildSubscriptionId(userId, novelId, -1);
    const subRef = db.collection("subscriptions").doc(subId);
    const subData = {
      user_id: userId,
      novel_id: novelId,
      chapter_index: -1,
      type: "novel" as const,
      credits_paid: price,
      subscribed_at: now,
    };
    transaction.set(subRef, subData);

    return { credits_remaining: credits - price, subData };
  });

  logger.info("Novel subscribed", { userId, novelId, price });

  return {
    subscription: subscriptionDocToData(buildSubscriptionId(userId, novelId, -1), result.subData),
    credits_remaining: result.credits_remaining,
  };
}

export async function listUserSubscriptions(
  userId: string,
  params: { page?: number; limit?: number },
): Promise<PaginatedResult<SubscriptionDocument>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  let query: admin.firestore.Query = db
    .collection("subscriptions")
    .where("user_id", "==", userId)
    .orderBy("subscribed_at", "desc");

  // Get total count
  const totalCount = await db
    .collection("subscriptions")
    .where("user_id", "==", userId)
    .count()
    .get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const subscriptions = snapshot.docs.map((doc) => subscriptionDocToData(doc.id, doc.data()));

  return { items: subscriptions, page, limit, total };
}

export async function checkAccess(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<{
  has_access: boolean;
  access_type: string;
  purchase_type?: string;
  price?: number;
  novel_price?: number | null;
}> {
  const chapter = await getChapter(novelId, chapterIndex);
  const novel = await getNovel(novelId);

  if (chapter.access_type === "free") {
    return { has_access: true, access_type: "free" };
  }

  if (chapter.access_type === "free_auth") {
    return { has_access: !!userId, access_type: "free_auth" };
  }

  // paid chapter
  if (!userId) {
    return {
      has_access: false,
      access_type: "paid",
      price: chapter.price,
      novel_price: novel.price,
    };
  }

  const hasAccess = await checkSubscriptionAccess(userId, novelId, chapterIndex);

  if (hasAccess) {
    // Determine purchase type
    const db = getFirestore();
    const novelSub = await db
      .collection("subscriptions")
      .doc(buildSubscriptionId(userId, novelId, -1))
      .get();
    return {
      has_access: true,
      access_type: "paid",
      purchase_type: novelSub.exists ? "novel" : "chapter",
    };
  }

  return {
    has_access: false,
    access_type: "paid",
    price: chapter.price,
    novel_price: novel.price,
  };
}
