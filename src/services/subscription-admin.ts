import type admin from "firebase-admin";
import type { PaginatedResult, SubscriptionDocument } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

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

export async function listSubscriptions(params: {
  page: number;
  limit: number;
  user_id?: string;
  novel_id?: string;
  type?: string;
}): Promise<PaginatedResult<SubscriptionDocument>> {
  const db = getFirestore();
  const { page, limit, user_id, novel_id, type } = params;

  let query: admin.firestore.Query = db
    .collection("subscriptions")
    .orderBy("subscribed_at", "desc");

  if (user_id) {
    query = query.where("user_id", "==", user_id);
  }
  if (novel_id) {
    query = query.where("novel_id", "==", novel_id);
  }
  if (type) {
    query = query.where("type", "==", type);
  }

  const totalCount = await db.collection("subscriptions").count().get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const items = snapshot.docs.map((doc) => subscriptionDocToData(doc.id, doc.data()));

  return { items, page, limit, total };
}

export async function getSubscription(id: string): Promise<SubscriptionDocument> {
  const db = getFirestore();
  const doc = await db.collection("subscriptions").doc(id).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Subscription not found");
  return subscriptionDocToData(doc.id, data);
}

export async function deleteSubscription(id: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("subscriptions").doc(id).get();
  if (!doc.exists) throw new NotFoundError("Subscription not found");

  await db.collection("subscriptions").doc(id).delete();
  logger.info("Subscription deleted by admin", { subscriptionId: id });
}
