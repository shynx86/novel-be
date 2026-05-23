import type admin from "firebase-admin";
import type {
  NovelAuthorRelation,
  NovelGenreRelation,
  NovelTranslatorRelation,
  PaginatedResult,
} from "../types/novel.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function junctionDocId(novelId: string, entityId: string): string {
  return `${novelId}:${entityId}`;
}

// ─── Set relations (atomic replace) ─────────────────────────────────────────

export async function setNovelAuthors(novelId: string, authorIds: string[]): Promise<void> {
  const db = getFirestore();
  const col = db.collection("novel_authors");

  // Get existing
  const existing = await col.where("novel_id", "==", novelId).get();
  const existingIds = new Set(existing.docs.map((d) => d.data().author_id));
  const newIds = new Set(authorIds);

  const batch = db.batch();
  const now = new Date().toISOString();

  // Delete removed
  for (const doc of existing.docs) {
    if (!newIds.has(doc.data().author_id)) {
      batch.delete(doc.ref);
    }
  }

  // Create new
  for (const authorId of authorIds) {
    if (!existingIds.has(authorId)) {
      const ref = col.doc(junctionDocId(novelId, authorId));
      batch.set(ref, { novel_id: novelId, author_id: authorId, created_at: now });
    }
  }

  await batch.commit();
  logger.info("Novel authors updated", { novelId, authorIds });
}

export async function setNovelTranslators(novelId: string, translatorIds: string[]): Promise<void> {
  const db = getFirestore();
  const col = db.collection("novel_translators");

  const existing = await col.where("novel_id", "==", novelId).get();
  const existingIds = new Set(existing.docs.map((d) => d.data().translator_id));
  const newIds = new Set(translatorIds);

  const batch = db.batch();
  const now = new Date().toISOString();

  for (const doc of existing.docs) {
    if (!newIds.has(doc.data().translator_id)) {
      batch.delete(doc.ref);
    }
  }

  for (const translatorId of translatorIds) {
    if (!existingIds.has(translatorId)) {
      const ref = col.doc(junctionDocId(novelId, translatorId));
      batch.set(ref, { novel_id: novelId, translator_id: translatorId, created_at: now });
    }
  }

  await batch.commit();
  logger.info("Novel translators updated", { novelId, translatorIds });
}

export async function setNovelGenres(novelId: string, genreIds: string[]): Promise<void> {
  const db = getFirestore();
  const col = db.collection("novel_genres");

  const existing = await col.where("novel_id", "==", novelId).get();
  const existingIds = new Set(existing.docs.map((d) => d.data().genre_id));
  const newIds = new Set(genreIds);

  const batch = db.batch();
  const now = new Date().toISOString();

  for (const doc of existing.docs) {
    if (!newIds.has(doc.data().genre_id)) {
      batch.delete(doc.ref);
    }
  }

  for (const genreId of genreIds) {
    if (!existingIds.has(genreId)) {
      const ref = col.doc(junctionDocId(novelId, genreId));
      batch.set(ref, { novel_id: novelId, genre_id: genreId, created_at: now });
    }
  }

  await batch.commit();
  logger.info("Novel genres updated", { novelId, genreIds });
}

// ─── Get relations (resolved with names) ────────────────────────────────────

export async function getNovelAuthors(novelId: string): Promise<NovelAuthorRelation[]> {
  const db = getFirestore();
  const snapshot = await db.collection("novel_authors").where("novel_id", "==", novelId).get();

  if (snapshot.empty) return [];

  const authorIds = snapshot.docs.map((d) => d.data().author_id as string);
  const authorRefs = authorIds.map((id) => db.collection("authors").doc(id));
  const authorDocs = await db.getAll(...authorRefs);

  return authorDocs
    .filter((doc) => doc.exists)
    .map((doc) => ({
      author_id: doc.id,
      author_name: doc.data()?.name,
    }));
}

export async function getNovelTranslators(novelId: string): Promise<NovelTranslatorRelation[]> {
  const db = getFirestore();
  const snapshot = await db.collection("novel_translators").where("novel_id", "==", novelId).get();

  if (snapshot.empty) return [];

  const translatorIds = snapshot.docs.map((d) => d.data().translator_id as string);
  const translatorRefs = translatorIds.map((id) => db.collection("translators").doc(id));
  const translatorDocs = await db.getAll(...translatorRefs);

  return translatorDocs
    .filter((doc) => doc.exists)
    .map((doc) => ({
      translator_id: doc.id,
      translator_name: doc.data()?.name,
    }));
}

export async function getNovelGenres(novelId: string): Promise<NovelGenreRelation[]> {
  const db = getFirestore();
  const snapshot = await db.collection("novel_genres").where("novel_id", "==", novelId).get();

  if (snapshot.empty) return [];

  const genreIds = snapshot.docs.map((d) => d.data().genre_id as string);
  const genreRefs = genreIds.map((id) => db.collection("genres").doc(id));
  const genreDocs = await db.getAll(...genreRefs);

  return genreDocs
    .filter((doc) => doc.exists)
    .map((doc) => ({
      genre_id: doc.id,
      genre_name: doc.data()?.name,
    }));
}

// ─── Query novels by entity ─────────────────────────────────────────────────

export async function getNovelsByAuthor(
  authorId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<string>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  let query: admin.firestore.Query = db
    .collection("novel_authors")
    .where("author_id", "==", authorId);

  const totalCount = await db
    .collection("novel_authors")
    .where("author_id", "==", authorId)
    .count()
    .get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const novelIds = snapshot.docs.map((d) => d.data().novel_id as string);

  return { items: novelIds, page, limit, total };
}

export async function getNovelsByTranslator(
  translatorId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<string>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  let query: admin.firestore.Query = db
    .collection("novel_translators")
    .where("translator_id", "==", translatorId);

  const totalCount = await db
    .collection("novel_translators")
    .where("translator_id", "==", translatorId)
    .count()
    .get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const novelIds = snapshot.docs.map((d) => d.data().novel_id as string);

  return { items: novelIds, page, limit, total };
}

export async function getNovelsByGenre(
  genreId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<string>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  let query: admin.firestore.Query = db.collection("novel_genres").where("genre_id", "==", genreId);

  const totalCount = await db
    .collection("novel_genres")
    .where("genre_id", "==", genreId)
    .count()
    .get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const novelIds = snapshot.docs.map((d) => d.data().novel_id as string);

  return { items: novelIds, page, limit, total };
}
