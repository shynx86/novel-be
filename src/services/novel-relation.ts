import type admin from "firebase-admin";
import type { NovelAuthorRelation, NovelGenreRelation, PaginatedResult } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";
import { publicFilterKeys } from "./novel-list-index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function junctionDocId(novelId: string, entityId: string): string {
  return `${novelId}:${entityId}`;
}

// ─── Set relations (atomic replace) ─────────────────────────────────────────

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function setNovelRelations(
  novelId: string,
  input: { authorIds?: string[]; genreIds?: string[] },
): Promise<void> {
  if (input.authorIds === undefined && input.genreIds === undefined) return;

  const db = getFirestore();
  const novelRef = db.collection("novels").doc(novelId);
  const authorCollection = db.collection("novel_authors");
  const genreCollection = db.collection("novel_genres");
  const result = await db.runTransaction(async (transaction) => {
    const novelDoc = await transaction.get(novelRef);
    if (!novelDoc.exists) throw new NotFoundError("Novel not found");
    const novelData = novelDoc.data() ?? {};
    const hasStoredAuthorIds = Array.isArray(novelData.author_ids);
    const hasStoredGenreIds = Array.isArray(novelData.genre_ids);
    const [existingAuthors, existingGenres] = await Promise.all([
      input.authorIds !== undefined || !hasStoredAuthorIds
        ? transaction.get(authorCollection.where("novel_id", "==", novelId))
        : Promise.resolve(null),
      input.genreIds !== undefined || !hasStoredGenreIds
        ? transaction.get(genreCollection.where("novel_id", "==", novelId))
        : Promise.resolve(null),
    ]);
    const authorIds = uniqueIds(
      input.authorIds ??
        (hasStoredAuthorIds
          ? (novelData.author_ids as unknown[]).filter(
              (id: unknown): id is string => typeof id === "string",
            )
          : (existingAuthors?.docs.map((doc) => doc.data().author_id as string) ?? [])),
    );
    const genreIds = uniqueIds(
      input.genreIds ??
        (hasStoredGenreIds
          ? (novelData.genre_ids as unknown[]).filter(
              (id: unknown): id is string => typeof id === "string",
            )
          : (existingGenres?.docs.map((doc) => doc.data().genre_id as string) ?? [])),
    );
    const now = new Date().toISOString();

    if (existingAuthors && input.authorIds !== undefined) {
      const previousIds = new Set(
        existingAuthors.docs.map((doc) => doc.data().author_id as string),
      );
      const nextIds = new Set(authorIds);
      for (const doc of existingAuthors.docs) {
        if (!nextIds.has(doc.data().author_id)) transaction.delete(doc.ref);
      }
      for (const authorId of authorIds) {
        if (!previousIds.has(authorId)) {
          transaction.set(authorCollection.doc(junctionDocId(novelId, authorId)), {
            novel_id: novelId,
            author_id: authorId,
            created_at: now,
          });
        }
      }
    }

    if (existingGenres && input.genreIds !== undefined) {
      const previousIds = new Set(existingGenres.docs.map((doc) => doc.data().genre_id as string));
      const nextIds = new Set(genreIds);
      for (const doc of existingGenres.docs) {
        if (!nextIds.has(doc.data().genre_id)) transaction.delete(doc.ref);
      }
      for (const genreId of genreIds) {
        if (!previousIds.has(genreId)) {
          transaction.set(genreCollection.doc(junctionDocId(novelId, genreId)), {
            novel_id: novelId,
            genre_id: genreId,
            created_at: now,
          });
        }
      }
    }

    transaction.update(novelRef, {
      author_ids: authorIds,
      genre_ids: genreIds,
      public_filter_keys: publicFilterKeys({
        ...novelData,
        author_ids: authorIds,
        genre_ids: genreIds,
      }),
    });
    return { authorIds, genreIds };
  });
  logger.info("Novel relations updated", { novelId, ...result });
}

export async function setNovelAuthors(novelId: string, authorIds: string[]): Promise<void> {
  await setNovelRelations(novelId, { authorIds });
}

export async function setNovelGenres(novelId: string, genreIds: string[]): Promise<void> {
  await setNovelRelations(novelId, { genreIds });
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
