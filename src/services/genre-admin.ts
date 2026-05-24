import type admin from "firebase-admin";
import type { GenreCreateInput, GenreDocument, GenreUpdateInput } from "../types/novel.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

function genreDocToData(id: string, data: admin.firestore.DocumentData): GenreDocument {
  return {
    id,
    name: data.name,
    slug: data.slug,
  };
}

export async function listGenresAdmin(page: number, limit: number) {
  const db = getFirestore();

  const totalCount = await db.collection("genres").count().get();
  const total = totalCount.data().count;

  let query: admin.firestore.Query = db.collection("genres").orderBy("name", "asc");
  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }
  const snapshot = await query.limit(limit).get();

  return {
    items: snapshot.docs.map((doc) => genreDocToData(doc.id, doc.data())),
    page,
    limit,
    total,
  };
}

export async function createGenre(input: GenreCreateInput): Promise<GenreDocument> {
  const db = getFirestore();
  const slug =
    input.slug ||
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  // Check for duplicate slug
  const existing = await db.collection("genres").doc(slug).get();
  if (existing.exists) {
    throw new ConflictError("Genre with this slug already exists", { slug });
  }

  const docData = {
    name: input.name,
    slug,
  };

  await db.collection("genres").doc(slug).set(docData);
  logger.info("Genre created", { genreId: slug, name: input.name });

  return genreDocToData(slug, docData);
}

export async function updateGenre(
  genreId: string,
  input: GenreUpdateInput,
): Promise<GenreDocument> {
  const db = getFirestore();
  const doc = await db.collection("genres").doc(genreId).get();
  if (!doc.exists) throw new NotFoundError("Genre not found");

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.slug !== undefined) updates.slug = input.slug;

  if (Object.keys(updates).length > 0) {
    await db.collection("genres").doc(genreId).update(updates);
    logger.info("Genre updated", { genreId });
  }

  const updated = await db.collection("genres").doc(genreId).get();
  const data = updated.data();
  if (!data) throw new NotFoundError("Genre not found after update");
  return genreDocToData(genreId, data);
}

export async function deleteGenre(genreId: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("genres").doc(genreId).get();
  if (!doc.exists) throw new NotFoundError("Genre not found");

  await db.collection("genres").doc(genreId).delete();
  logger.info("Genre deleted", { genreId });
}
