import type admin from "firebase-admin";
import type { NovelDocument, PaginatedResult } from "../types/novel.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

export interface FavoriteDocument {
  novel_id: string;
  added_at: string;
}

export interface FavoriteWithNovel extends FavoriteDocument {
  novel: NovelDocument | null;
}

export async function addFavorite(userId: string, novelId: string): Promise<FavoriteDocument> {
  const db = getFirestore();
  const docRef = db.collection("users").doc(userId).collection("favorites").doc(novelId);
  const existing = await docRef.get();

  if (existing.exists) {
    throw new ConflictError("Novel is already in favorites");
  }

  const now = new Date().toISOString();
  const docData = { novel_id: novelId, added_at: now };

  await docRef.set(docData);
  logger.info("Favorite added", { userId, novelId });

  return docData;
}

export async function removeFavorite(userId: string, novelId: string): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection("users").doc(userId).collection("favorites").doc(novelId);
  const existing = await docRef.get();

  if (!existing.exists) {
    throw new NotFoundError("Favorite not found");
  }

  await docRef.delete();
  logger.info("Favorite removed", { userId, novelId });
}

export async function checkFavorite(
  userId: string,
  novelId: string,
): Promise<{ is_favorited: boolean }> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("favorites").doc(novelId).get();
  return { is_favorited: doc.exists };
}

export async function listFavorites(
  userId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<FavoriteWithNovel>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  const snapshot = await db
    .collection("users")
    .doc(userId)
    .collection("favorites")
    .orderBy("added_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit)
    .get();

  const totalCount = await db.collection("users").doc(userId).collection("favorites").count().get();

  const total = totalCount.data().count;

  // Batch fetch novel details
  const novelIds = snapshot.docs.map((doc) => doc.id);
  const novelRefs = novelIds.map((id) => db.collection("novels").doc(id));
  const novelDocs = await db.getAll(...novelRefs);

  const favorites: FavoriteWithNovel[] = snapshot.docs.map((doc, i) => {
    const data = doc.data();
    const novelDoc = novelDocs[i];
    const novelData = novelDoc.exists ? novelDoc.data() : null;

    return {
      novel_id: data.novel_id,
      added_at: data.added_at,
      novel: novelData
        ? {
            id: novelDoc.id,
            title: novelData.title,
            description: novelData.description,
            cover_url: novelData.cover_url,
            status: novelData.status,
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
  });

  return { items: favorites, page, limit, total };
}
