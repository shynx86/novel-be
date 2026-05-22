import type admin from "firebase-admin";
import type { AdCreateInput, AdDocument, AdUpdateInput, PaginatedResult } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

function adDocToData(id: string, data: admin.firestore.DocumentData): AdDocument {
  return {
    id,
    title: data.title,
    image_url: data.image_url,
    link_url: data.link_url,
    position: data.position,
    is_active: data.is_active ?? true,
    display_order: data.display_order ?? 0,
    start_date: data.start_date ?? null,
    end_date: data.end_date ?? null,
    click_count: data.click_count ?? 0,
    impression_count: data.impression_count ?? 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listAds(params: {
  page: number;
  limit: number;
}): Promise<PaginatedResult<AdDocument>> {
  const db = getFirestore();
  const { page, limit } = params;

  let query: admin.firestore.Query = db.collection("ads").orderBy("display_order", "asc");

  const totalCount = await db.collection("ads").count().get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const items = snapshot.docs.map((doc) => adDocToData(doc.id, doc.data()));

  return { items, page, limit, total };
}

export async function getAd(adId: string): Promise<AdDocument> {
  const db = getFirestore();
  const doc = await db.collection("ads").doc(adId).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Ad not found");
  return adDocToData(adId, data);
}

export async function createAd(input: AdCreateInput): Promise<AdDocument> {
  const db = getFirestore();
  const now = new Date().toISOString();

  const docData = {
    title: input.title,
    image_url: input.image_url,
    link_url: input.link_url,
    position: input.position,
    is_active: input.is_active ?? true,
    display_order: input.display_order ?? 0,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    click_count: 0,
    impression_count: 0,
    created_at: now,
    updated_at: now,
  };

  const ref = await db.collection("ads").add(docData);
  logger.info("Ad created", { adId: ref.id, title: input.title });

  return adDocToData(ref.id, docData);
}

export async function updateAd(adId: string, input: AdUpdateInput): Promise<AdDocument> {
  const db = getFirestore();
  const doc = await db.collection("ads").doc(adId).get();
  if (!doc.exists) throw new NotFoundError("Ad not found");

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (input.title !== undefined) updates.title = input.title;
  if (input.image_url !== undefined) updates.image_url = input.image_url;
  if (input.link_url !== undefined) updates.link_url = input.link_url;
  if (input.position !== undefined) updates.position = input.position;
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  if (input.display_order !== undefined) updates.display_order = input.display_order;
  if (input.start_date !== undefined) updates.start_date = input.start_date;
  if (input.end_date !== undefined) updates.end_date = input.end_date;

  await db.collection("ads").doc(adId).update(updates);
  logger.info("Ad updated", { adId });

  const updated = await db.collection("ads").doc(adId).get();
  const data = updated.data();
  if (!data) throw new NotFoundError("Ad not found after update");
  return adDocToData(adId, data);
}

export async function deleteAd(adId: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("ads").doc(adId).get();
  if (!doc.exists) throw new NotFoundError("Ad not found");

  await db.collection("ads").doc(adId).delete();
  logger.info("Ad deleted", { adId });
}
