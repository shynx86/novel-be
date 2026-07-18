import admin from "firebase-admin";
import type {
  ChapterCreateInput,
  ChapterDocument,
  ChapterUpdateInput,
  PaginatedResult,
} from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";
import { getNovel } from "./novel.js";

function chapterDocToData(data: admin.firestore.DocumentData): ChapterDocument {
  return {
    index: data.index,
    title: data.title,
    content: data.content,
    word_count: data.word_count,
    access_type: data.access_type,
    price: data.price || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function getChapter(novelId: string, index: number): Promise<ChapterDocument> {
  const db = getFirestore();
  const doc = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .get();

  if (!doc.exists) {
    throw new NotFoundError("Chapter not found");
  }

  const data = doc.data();
  if (!data) throw new NotFoundError("Chapter not found");
  return chapterDocToData(data);
}

export async function getChapterMeta(
  novelId: string,
  index: number,
): Promise<Omit<ChapterDocument, "content">> {
  const db = getFirestore();
  const doc = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .get();

  if (!doc.exists) {
    throw new NotFoundError("Chapter not found");
  }

  const data = doc.data();
  if (!data) throw new NotFoundError("Chapter not found");
  return {
    index: data.index,
    title: data.title,
    word_count: data.word_count,
    access_type: data.access_type,
    price: data.price || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listChapters(
  novelId: string,
  params: { page?: number; limit?: number; includeContent?: boolean },
): Promise<PaginatedResult<Omit<ChapterDocument, "content"> & { content?: string }>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  // Verify novel exists
  await getNovel(novelId);

  let query: admin.firestore.Query = db.collection("novels").doc(novelId).collection("chapters");

  // Select fields if content not needed
  if (!params.includeContent) {
    query = query.select(
      "index",
      "title",
      "word_count",
      "access_type",
      "price",
      "created_at",
      "updated_at",
    );
  }

  // Get total count
  const totalCount = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .count()
    .get();
  const total = totalCount.data().count;

  // Order and paginate
  query = query.orderBy("index", "asc");

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const chapters = snapshot.docs
    .map((doc) => doc.data())
    .filter((data): data is admin.firestore.DocumentData => !!data)
    .map((data) => {
      const base = {
        index: data.index,
        title: data.title,
        word_count: data.word_count,
        access_type: data.access_type,
        price: data.price || 0,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      if (params.includeContent) {
        return { ...base, content: data.content };
      }
      return base;
    });

  return { items: chapters, page, limit, total };
}

export async function createChapter(
  novelId: string,
  input: ChapterCreateInput,
): Promise<ChapterDocument> {
  const db = getFirestore();
  const wordCount = input.content.split(/\s+/).filter(Boolean).length;

  // Use transaction to atomically assign index + create chapter + update counters
  const result = await db.runTransaction(async (transaction) => {
    const now = new Date().toISOString();

    // Auto-assign index (max existing + 1)
    const existingChapters = await transaction.get(
      db.collection("novels").doc(novelId).collection("chapters").orderBy("index", "desc").limit(1),
    );

    const nextIndex = existingChapters.empty ? 1 : (existingChapters.docs[0].data().index || 0) + 1;

    const accessType = input.access_type ?? (nextIndex <= 10 ? "free" : "free_auth");

    const chapterData = {
      index: nextIndex,
      title: input.title,
      content: input.content,
      word_count: wordCount,
      access_type: accessType,
      price: accessType === "paid" ? input.price || 0 : 0,
      created_at: now,
      updated_at: now,
    };

    const chapterRef = db
      .collection("novels")
      .doc(novelId)
      .collection("chapters")
      .doc(String(nextIndex));
    transaction.set(chapterRef, chapterData);

    // Update novel counters
    const novelRef = db.collection("novels").doc(novelId);
    transaction.update(novelRef, {
      chapter_count: admin.firestore.FieldValue.increment(1),
      total_word_count: admin.firestore.FieldValue.increment(wordCount),
      updated_at: now,
    });

    return { chapterData, nextIndex };
  });

  logger.info("Chapter created", { novelId, index: result.nextIndex });

  return chapterDocToData(result.chapterData);
}

export async function updateChapter(
  novelId: string,
  index: number,
  input: ChapterUpdateInput,
): Promise<ChapterDocument> {
  const db = getFirestore();
  const now = new Date().toISOString();

  // Get existing chapter
  const existing = await getChapter(novelId, index);

  const updates: Record<string, unknown> = { updated_at: now };
  let wordCountDelta = 0;

  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) {
    updates.content = input.content;
    const newWordCount = input.content.split(/\s+/).filter(Boolean).length;
    updates.word_count = newWordCount;
    wordCountDelta = newWordCount - existing.word_count;
  }
  if (input.access_type !== undefined) updates.access_type = input.access_type;
  if (input.price !== undefined) {
    updates.price = input.price;
  }

  await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .update(updates);

  // Update novel's total_word_count if content changed
  if (wordCountDelta !== 0) {
    await db
      .collection("novels")
      .doc(novelId)
      .update({
        total_word_count: admin.firestore.FieldValue.increment(wordCountDelta),
        updated_at: now,
      });
  }

  logger.info("Chapter updated", { novelId, index });

  return { ...existing, ...updates } as ChapterDocument;
}

export async function deleteChapter(novelId: string, index: number): Promise<void> {
  const db = getFirestore();
  const now = new Date().toISOString();

  const existing = await getChapter(novelId, index);

  await db.collection("novels").doc(novelId).collection("chapters").doc(String(index)).delete();

  // Update novel counters
  await db
    .collection("novels")
    .doc(novelId)
    .update({
      chapter_count: admin.firestore.FieldValue.increment(-1),
      total_word_count: admin.firestore.FieldValue.increment(-existing.word_count),
      updated_at: now,
    });

  logger.info("Chapter deleted", { novelId, index });
}
