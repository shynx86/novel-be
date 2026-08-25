import type admin from "firebase-admin";
import type { NovelDocument, PaginatedResult } from "../types/novel.js";
import { toVietnameseSlug } from "../utils/slug.js";
import { getFirestore } from "./firebase.js";
import { listGenres } from "./genre.js";
import { enrichNovelsWithRelations } from "./novel.js";

export interface NovelSearchParams {
  title?: string;
  author?: string;
  genreId?: string;
  translatorId?: string;
  page?: number;
  limit?: number;
}

export interface SearchOptions {
  genres: { id: string; name: string }[];
  translators: { id: string; name: string; username: string }[];
}

export interface NovelSearchResult extends PaginatedResult<NovelDocument> {
  capped: boolean;
}

const MAX_CANDIDATES = 250;
const OPTIONS_CACHE_MS = 5 * 60_000;
let optionsCache: { expiresAt: number; value: SearchOptions } | null = null;

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("vi");
}

function novelDocToData(id: string, data: admin.firestore.DocumentData): NovelDocument {
  return {
    id,
    slug: data.slug || id,
    title: data.title || "",
    description: data.description || "",
    cover_url: data.cover_url || "",
    status: data.status === "completed" || data.status === "hiatus" ? data.status : "ongoing",
    publication_status: data.publication_status === "draft" ? "draft" : "public",
    chapter_count: data.chapter_count || 0,
    public_chapter_count: data.public_chapter_count ?? data.chapter_count ?? 0,
    total_word_count: data.total_word_count || 0,
    rating: data.rating ?? 0,
    views: data.views ?? 0,
    followers: data.followers ?? 0,
    comment_count: data.comment_count ?? 0,
    price: data.price ?? null,
    is_featured: data.is_featured ?? false,
    translator_id: data.translator_id ?? undefined,
    created_at: data.created_at ?? "",
    updated_at: data.updated_at ?? "",
  };
}

function intersectSets(sets: Set<string>[]): Set<string> | null {
  if (sets.length === 0) return null;
  const [smallest, ...rest] = [...sets].sort((left, right) => left.size - right.size);
  return new Set([...smallest].filter((id) => rest.every((set) => set.has(id))));
}

async function relationCandidateIds(
  db: admin.firestore.Firestore,
  params: NovelSearchParams,
): Promise<Set<string> | null> {
  const sets: Set<string>[] = [];

  if (params.author) {
    const slug = toVietnameseSlug(params.author);
    const authors = await db
      .collection("authors")
      .orderBy("slug")
      .startAt(slug)
      .endAt(`${slug}\uf8ff`)
      .limit(20)
      .get();
    const authorIds = authors.docs.map((doc) => doc.id);
    if (authorIds.length === 0) return new Set();
    const relations = await db
      .collection("novel_authors")
      .where("author_id", "in", authorIds)
      .limit(MAX_CANDIDATES)
      .get();
    sets.push(new Set(relations.docs.map((doc) => doc.data().novel_id as string)));
  }

  if (params.genreId) {
    const relations = await db
      .collection("novel_genres")
      .where("genre_id", "==", params.genreId)
      .limit(MAX_CANDIDATES)
      .get();
    sets.push(new Set(relations.docs.map((doc) => doc.data().novel_id as string)));
  }

  if (params.translatorId) {
    const novels = await db
      .collection("novels")
      .where("translator_id", "==", params.translatorId)
      .limit(MAX_CANDIDATES)
      .get();
    sets.push(new Set(novels.docs.map((doc) => doc.id)));
  }

  return intersectSets(sets);
}

async function loadCandidates(
  params: NovelSearchParams,
): Promise<{ items: NovelDocument[]; capped: boolean }> {
  const db = getFirestore();
  const relationIds = await relationCandidateIds(db, params);

  if (relationIds !== null) {
    const ids = [...relationIds].slice(0, MAX_CANDIDATES);
    if (ids.length === 0) return { items: [], capped: false };
    const docs = await db.getAll(...ids.map((id) => db.collection("novels").doc(id)));
    return {
      items: docs.flatMap((doc) => {
        const data = doc.data();
        return doc.exists && data ? [novelDocToData(doc.id, data)] : [];
      }),
      capped: relationIds.size > MAX_CANDIDATES,
    };
  }

  const snapshot = await db
    .collection("novels")
    .where("publication_status", "==", "public")
    .orderBy("title_lowercase")
    .limit(MAX_CANDIDATES)
    .get();
  return {
    items: snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data())),
    capped: snapshot.docs.length === MAX_CANDIDATES,
  };
}

export async function searchNovels(params: NovelSearchParams): Promise<NovelSearchResult> {
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 30);
  const candidates = await loadCandidates(params);
  const enriched = await enrichNovelsWithRelations(candidates.items);
  const title = normalizeSearchText(params.title || "");
  const author = toVietnameseSlug(params.author || "");

  const matches = enriched
    .filter((novel) => novel.publication_status === "public")
    .filter((novel) => !title || normalizeSearchText(novel.title).includes(title))
    .filter(
      (novel) =>
        !author || novel.authors?.some((item) => toVietnameseSlug(item.name).includes(author)),
    )
    .filter((novel) => !params.genreId || novel.genres?.some((item) => item.id === params.genreId))
    .filter((novel) => !params.translatorId || novel.translator_id === params.translatorId)
    .sort((left, right) => left.title.localeCompare(right.title, "vi"));

  return {
    items: matches.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: matches.length,
    capped: candidates.capped,
  };
}

export async function getSearchOptions(): Promise<SearchOptions> {
  if (optionsCache && optionsCache.expiresAt > Date.now()) return optionsCache.value;

  const db = getFirestore();
  const [genres, novelSnapshot] = await Promise.all([
    listGenres(),
    db
      .collection("novels")
      .where("publication_status", "==", "public")
      .select("translator_id")
      .limit(500)
      .get(),
  ]);
  const translatorIds = [
    ...new Set(
      novelSnapshot.docs
        .map((doc) => doc.data().translator_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id)),
    ),
  ].slice(0, 100);
  const translatorDocs = translatorIds.length
    ? await db.getAll(...translatorIds.map((id) => db.collection("users").doc(id)))
    : [];
  const value: SearchOptions = {
    genres: genres.map((genre) => ({ id: genre.id, name: genre.name })),
    translators: translatorDocs
      .flatMap((doc) => {
        const data = doc.data();
        if (!doc.exists || !data) return [];
        return [
          {
            id: doc.id,
            name: data.display_name || data.username || "Dịch giả",
            username: data.username || `user_${doc.id}`,
          },
        ];
      })
      .sort((left, right) => left.name.localeCompare(right.name, "vi")),
  };
  optionsCache = { value, expiresAt: Date.now() + OPTIONS_CACHE_MS };
  return value;
}
