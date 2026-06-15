import type admin from "firebase-admin";
import type {
  AuthorCreateInput,
  AuthorDocument,
  AuthorUpdateInput,
  PaginatedResult,
} from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

function authorDocToData(
  id: string,
  data: admin.firestore.DocumentData,
  novelCount = 0,
): AuthorDocument {
  return {
    id,
    name: data.name,
    slug: data.slug,
    bio: data.bio ?? "",
    avatar_url: data.avatar_url ?? "",
    novel_count: novelCount,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listAuthors(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResult<AuthorDocument>> {
  const db = getFirestore();
  const { page, limit } = params;

  let query: admin.firestore.Query = db.collection("authors").orderBy("name", "asc");

  const totalCount = await db.collection("authors").count().get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();

  // Batch count novels for each author
  const countPromises = snapshot.docs.map((doc) =>
    db.collection("novel_authors").where("author_id", "==", doc.id).count().get(),
  );
  const countResults = await Promise.all(countPromises);

  const items = snapshot.docs.map((doc, i) =>
    authorDocToData(doc.id, doc.data(), countResults[i].data().count),
  );

  return { items, page, limit, total };
}

export async function getAuthor(authorId: string): Promise<AuthorDocument> {
  const db = getFirestore();
  const doc = await db.collection("authors").doc(authorId).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Author not found");

  const countSnap = await db
    .collection("novel_authors")
    .where("author_id", "==", authorId)
    .count()
    .get();

  return authorDocToData(authorId, data, countSnap.data().count);
}

export async function createAuthor(input: AuthorCreateInput): Promise<AuthorDocument> {
  const db = getFirestore();
  const now = new Date().toISOString();
  const slug =
    input.slug ||
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const docData = {
    name: input.name,
    slug,
    bio: input.bio ?? "",
    avatar_url: input.avatar_url ?? "",
    created_at: now,
    updated_at: now,
  };

  const ref = await db.collection("authors").add(docData);
  logger.info("Author created", { authorId: ref.id, name: input.name });

  return authorDocToData(ref.id, docData);
}

export async function updateAuthor(
  authorId: string,
  input: AuthorUpdateInput,
): Promise<AuthorDocument> {
  const db = getFirestore();
  const doc = await db.collection("authors").doc(authorId).get();
  if (!doc.exists) throw new NotFoundError("Author not found");

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (input.name !== undefined) updates.name = input.name;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;

  await db.collection("authors").doc(authorId).update(updates);
  logger.info("Author updated", { authorId });

  const updated = await db.collection("authors").doc(authorId).get();
  const data = updated.data();
  if (!data) throw new NotFoundError("Author not found after update");
  return authorDocToData(authorId, data);
}

export async function deleteAuthor(authorId: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("authors").doc(authorId).get();
  if (!doc.exists) throw new NotFoundError("Author not found");

  await db.collection("authors").doc(authorId).delete();
  logger.info("Author deleted", { authorId });
}

export async function getAuthorsByIds(ids: string[]): Promise<AuthorDocument[]> {
  if (ids.length === 0) return [];
  const db = getFirestore();
  const refs = ids.map((id) => db.collection("authors").doc(id));
  const docs = await db.getAll(...refs);

  const countPromises = ids.map((id) =>
    db.collection("novel_authors").where("author_id", "==", id).count().get(),
  );
  const countResults = await Promise.all(countPromises);

  return (
    docs
      .filter((doc) => doc.exists && doc.data())
      // biome-ignore lint/style/noNonNullAssertion: filter guarantees data() exists
      .map((doc, i) => authorDocToData(doc.id, doc.data()!, countResults[i].data().count))
  );
}
