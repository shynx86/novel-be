import type admin from "firebase-admin";
import type {
  NovelCreateInput,
  NovelDocument,
  NovelUpdateInput,
  PaginatedResult,
} from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";
import { getGenreBySlug } from "./genre.js";

function novelDocToData(id: string, data: admin.firestore.DocumentData): NovelDocument {
  return {
    id,
    slug: data.slug || id,
    title: data.title,
    description: data.description,
    author: data.author,
    cover_url: data.cover_url,
    genre: data.genre || [],
    status: data.status,
    chapter_count: data.chapter_count || 0,
    total_word_count: data.total_word_count || 0,
    rating: data.rating ?? 0,
    views: data.views ?? 0,
    followers: data.followers ?? 0,
    comment_count: data.comment_count ?? 0,
    price: data.price ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function createNovel(input: NovelCreateInput): Promise<NovelDocument> {
  const db = getFirestore();
  const now = new Date().toISOString();

  const docData = {
    slug: input.slug,
    title: input.title,
    description: input.description || "",
    author: input.author,
    cover_url: input.cover_url || "",
    genre: input.genre || [],
    status: input.status || "ongoing",
    chapter_count: 0,
    total_word_count: 0,
    rating: input.rating ?? 0,
    views: input.views ?? 0,
    followers: input.followers ?? 0,
    comment_count: 0,
    price: input.price !== undefined ? input.price : null,
    created_at: now,
    updated_at: now,
  };

  const ref = await db.collection("novels").add(docData);
  logger.info("Novel created", { novelId: ref.id, title: input.title });

  return novelDocToData(ref.id, docData);
}

export async function getNovel(novelId: string): Promise<NovelDocument> {
  const db = getFirestore();
  const doc = await db.collection("novels").doc(novelId).get();

  if (!doc.exists) {
    throw new NotFoundError("Novel not found");
  }

  const data = doc.data();
  if (!data) throw new NotFoundError("Novel not found");
  return novelDocToData(doc.id, data);
}

export async function getNovelBySlug(slug: string): Promise<NovelDocument> {
  const db = getFirestore();
  const snapshot = await db.collection("novels").where("slug", "==", slug).limit(1).get();

  if (snapshot.empty) {
    throw new NotFoundError("Novel not found");
  }

  const doc = snapshot.docs[0];
  return novelDocToData(doc.id, doc.data());
}

export async function listNovelsForSitemap(): Promise<
  { id: string; slug: string; chapter_count: number; updated_at: string }[]
> {
  const db = getFirestore();
  const snapshot = await db
    .collection("novels")
    .select("slug", "chapter_count", "updated_at")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    slug: doc.data().slug || doc.id,
    chapter_count: doc.data().chapter_count || 0,
    updated_at: doc.data().updated_at,
  }));
}

export async function getRelatedNovels(
  novelId: string,
  genreIndex = 0,
  limit = 10,
): Promise<NovelDocument[]> {
  const novel = await getNovel(novelId);
  const genre = novel.genre[genreIndex];
  if (!genre) return [];

  const db = getFirestore();
  const snapshot = await db
    .collection("novels")
    .where("genre", "array-contains", genre)
    .orderBy("updated_at", "desc")
    .limit(limit + 1)
    .get();

  return snapshot.docs
    .map((doc) => novelDocToData(doc.id, doc.data()))
    .filter((n) => n.id !== novelId)
    .slice(0, limit);
}

export async function getTrendingNovels(limit = 10): Promise<NovelDocument[]> {
  const db = getFirestore();
  const snapshot = await db.collection("novels").orderBy("views", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));
}

export async function getCompletedNovels(limit = 10): Promise<NovelDocument[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("novels")
    .where("status", "==", "completed")
    .orderBy("updated_at", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));
}

export async function listNovels(params: {
  page?: number;
  limit?: number;
  genre?: string;
  status?: string;
}): Promise<PaginatedResult<NovelDocument>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  let query: admin.firestore.Query = db.collection("novels");

  if (params.status) {
    query = query.where("status", "==", params.status);
  }

  if (params.genre) {
    query = query.where("genre", "array-contains", params.genre);
  }

  // Get total count
  const totalCount = await query.count().get();
  const total = totalCount.data().count;

  // Apply ordering and pagination
  query = query.orderBy("updated_at", "desc");

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const novels = snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));

  return { items: novels, page, limit, total };
}

export async function updateNovel(
  novelId: string,
  input: NovelUpdateInput,
): Promise<NovelDocument> {
  const db = getFirestore();

  const existing = await getNovel(novelId);
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updated_at: now };
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.author !== undefined) updates.author = input.author;
  if (input.cover_url !== undefined) updates.cover_url = input.cover_url;
  if (input.genre !== undefined) updates.genre = input.genre;
  if (input.status !== undefined) updates.status = input.status;
  if (input.rating !== undefined) updates.rating = input.rating;
  if (input.views !== undefined) updates.views = input.views;
  if (input.followers !== undefined) updates.followers = input.followers;
  if (input.price !== undefined) updates.price = input.price;

  await db.collection("novels").doc(novelId).update(updates);
  logger.info("Novel updated", { novelId });

  return { ...existing, ...updates, updated_at: now } as NovelDocument;
}

export async function deleteNovel(novelId: string): Promise<void> {
  const db = getFirestore();

  // Verify novel exists
  await getNovel(novelId);

  // Delete all chapters in subcollection
  const chaptersSnapshot = await db.collection("novels").doc(novelId).collection("chapters").get();

  const batch = db.batch();
  for (const doc of chaptersSnapshot.docs) {
    batch.delete(doc.ref);
  }
  if (chaptersSnapshot.size > 0) {
    await batch.commit();
  }

  // Delete novel document
  await db.collection("novels").doc(novelId).delete();
  logger.info("Novel deleted", { novelId, chaptersDeleted: chaptersSnapshot.size });
}
