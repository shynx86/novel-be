import type admin from "firebase-admin";
import type { NovelDocument, PaginatedResult } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

export interface ReadingHistoryDocument {
  novel_id: string;
  last_chapter_index: number;
  last_read_at: string;
  read_chapters: number[];
}

export interface ReadingHistoryWithNovel extends ReadingHistoryDocument {
  novel: NovelDocument | null;
}

export async function updateReadingProgress(
  userId: string,
  novelId: string,
  chapterIndex: number,
): Promise<ReadingHistoryDocument> {
  const db = getFirestore();
  const docRef = db.collection("users").doc(userId).collection("reading_history").doc(novelId);
  const existing = await docRef.get();

  const now = new Date().toISOString();

  if (existing.exists) {
    const data = existing.data();
    if (!data) {
      throw new NotFoundError("Reading history not found");
    }
    const readChapters = data.read_chapters || [];
    if (!readChapters.includes(chapterIndex)) {
      readChapters.push(chapterIndex);
      readChapters.sort((a: number, b: number) => a - b);
    }

    const updates = {
      last_chapter_index: chapterIndex,
      last_read_at: now,
      read_chapters: readChapters,
    };

    await docRef.update(updates);
    logger.info("Reading progress updated", { userId, novelId, chapterIndex });

    return { novel_id: novelId, ...updates };
  }

  const docData: ReadingHistoryDocument = {
    novel_id: novelId,
    last_chapter_index: chapterIndex,
    last_read_at: now,
    read_chapters: [chapterIndex],
  };

  await docRef.set(docData);
  logger.info("Reading history created", { userId, novelId, chapterIndex });

  return docData;
}

export async function removeFromHistory(userId: string, novelId: string): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection("users").doc(userId).collection("reading_history").doc(novelId);
  const existing = await docRef.get();

  if (!existing.exists) {
    throw new NotFoundError("Reading history not found");
  }

  await docRef.delete();
  logger.info("Reading history removed", { userId, novelId });
}

export async function listReadingHistory(
  userId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<ReadingHistoryWithNovel>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  const snapshot = await db
    .collection("users")
    .doc(userId)
    .collection("reading_history")
    .orderBy("last_read_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit)
    .get();

  // Batch fetch novel details
  const novelIds = snapshot.docs.map((doc) => doc.id);
  const novelRefs = novelIds.map((id) => db.collection("novels").doc(id));
  const novelDocs = await db.getAll(...novelRefs);

  const history: ReadingHistoryWithNovel[] = snapshot.docs
    .map((doc, i) => {
      const data = doc.data();
      const novelDoc = novelDocs[i];
      const novelData = novelDoc.exists ? novelDoc.data() : null;

      return {
        novel_id: data.novel_id,
        last_chapter_index: data.last_chapter_index,
        last_read_at: data.last_read_at,
        read_chapters: data.read_chapters || [],
        novel: novelData
          ? {
              id: novelDoc.id,
              title: novelData.title,
              description: novelData.description,
              cover_url: novelData.cover_url,
              status: novelData.status,
              publication_status: (novelData.publication_status === "draft"
                ? "draft"
                : "public") as NovelDocument["publication_status"],
              chapter_count: novelData.chapter_count || 0,
              total_word_count: novelData.total_word_count || 0,
              rating: novelData.rating ?? 0,
              views: novelData.views ?? 0,
              followers: novelData.followers ?? 0,
              comment_count: novelData.comment_count ?? 0,
              slug: novelData.slug || novelDoc.id,
              price: novelData.price ?? null,
              is_featured: novelData.is_featured ?? false,
              created_at: novelData.created_at,
              updated_at: novelData.updated_at,
            }
          : null,
      };
    })
    .filter((entry) => entry.novel?.publication_status === "public");

  return { items: history, page, limit, total: history.length };
}
