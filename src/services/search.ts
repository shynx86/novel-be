import type admin from "firebase-admin";
import type { NovelDocument, PaginatedResult } from "../types/novel.js";
import { getFirestore } from "./firebase.js";

function novelDocToData(id: string, data: admin.firestore.DocumentData): NovelDocument {
  return {
    id,
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
    slug: data.slug || id,
    price: data.price ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function searchNovels(params: {
  q?: string;
  genre?: string;
  status?: string;
  page?: number;
  limit?: number;
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

  // Firestore prefix matching: title >= q && title <= q + \uf8ff
  if (params.q && params.q.trim().length > 0) {
    const searchTerm = params.q.trim();
    query = query.orderBy("title").startAt(searchTerm).endAt(`${searchTerm}\uf8ff`);
  } else {
    query = query.orderBy("updated_at", "desc");
  }

  const totalCount = await query.count().get();
  const total = totalCount.data().count;

  if (!params.q || params.q.trim().length === 0) {
    query = query.orderBy("updated_at", "desc");
  }

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const novels = snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));

  return { items: novels, page, limit, total };
}
