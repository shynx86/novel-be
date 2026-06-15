import type admin from "firebase-admin";
import type {
  PaginatedResult,
  TranslatorCreateInput,
  TranslatorDocument,
  TranslatorUpdateInput,
} from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

function translatorDocToData(
  id: string,
  data: admin.firestore.DocumentData,
  novelCount = 0,
): TranslatorDocument {
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

export async function listTranslators(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResult<TranslatorDocument>> {
  const db = getFirestore();
  const { page, limit } = params;

  let query: admin.firestore.Query = db.collection("translators").orderBy("name", "asc");

  const totalCount = await db.collection("translators").count().get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();

  const countPromises = snapshot.docs.map((doc) =>
    db.collection("novel_translators").where("translator_id", "==", doc.id).count().get(),
  );
  const countResults = await Promise.all(countPromises);

  const items = snapshot.docs.map((doc, i) =>
    translatorDocToData(doc.id, doc.data(), countResults[i].data().count),
  );

  return { items, page, limit, total };
}

export async function getTranslator(translatorId: string): Promise<TranslatorDocument> {
  const db = getFirestore();
  const doc = await db.collection("translators").doc(translatorId).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Translator not found");

  const countSnap = await db
    .collection("novel_translators")
    .where("translator_id", "==", translatorId)
    .count()
    .get();

  return translatorDocToData(translatorId, data, countSnap.data().count);
}

export async function createTranslator(input: TranslatorCreateInput): Promise<TranslatorDocument> {
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

  const ref = await db.collection("translators").add(docData);
  logger.info("Translator created", { translatorId: ref.id, name: input.name });

  return translatorDocToData(ref.id, docData);
}

export async function updateTranslator(
  translatorId: string,
  input: TranslatorUpdateInput,
): Promise<TranslatorDocument> {
  const db = getFirestore();
  const doc = await db.collection("translators").doc(translatorId).get();
  if (!doc.exists) throw new NotFoundError("Translator not found");

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (input.name !== undefined) updates.name = input.name;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;

  await db.collection("translators").doc(translatorId).update(updates);
  logger.info("Translator updated", { translatorId });

  const updated = await db.collection("translators").doc(translatorId).get();
  const data = updated.data();
  if (!data) throw new NotFoundError("Translator not found after update");
  return translatorDocToData(translatorId, data);
}

export async function deleteTranslator(translatorId: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("translators").doc(translatorId).get();
  if (!doc.exists) throw new NotFoundError("Translator not found");

  await db.collection("translators").doc(translatorId).delete();
  logger.info("Translator deleted", { translatorId });
}

export async function getTranslatorsByIds(ids: string[]): Promise<TranslatorDocument[]> {
  if (ids.length === 0) return [];
  const db = getFirestore();
  const refs = ids.map((id) => db.collection("translators").doc(id));
  const docs = await db.getAll(...refs);

  const countPromises = ids.map((id) =>
    db.collection("novel_translators").where("translator_id", "==", id).count().get(),
  );
  const countResults = await Promise.all(countPromises);

  return (
    docs
      .filter((doc) => doc.exists && doc.data())
      // biome-ignore lint/style/noNonNullAssertion: filter guarantees data() exists
      .map((doc, i) => translatorDocToData(doc.id, doc.data()!, countResults[i].data().count))
  );
}
