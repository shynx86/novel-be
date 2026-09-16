import type admin from "firebase-admin";
import type { NovelDocument, PaginatedResult } from "../types/novel.js";
import { toVietnameseSlug } from "../utils/slug.js";
import { getFirestore } from "./firebase.js";
import { listGenres } from "./genre.js";
import { publicFilterKey, searchGram } from "./novel-list-index.js";
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

const SEARCH_BATCH_SIZE = 100;
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

async function* queryPages(
  query: admin.firestore.Query,
): AsyncGenerator<admin.firestore.QueryDocumentSnapshot> {
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await (cursor ? query.startAfter(cursor) : query).limit(SEARCH_BATCH_SIZE).get();
    for (const doc of page.docs) yield doc;
    if (page.docs.length < SEARCH_BATCH_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
}

async function matchingAuthorIds(author: string): Promise<string[]> {
  const slug = toVietnameseSlug(author);
  if (!slug) return [];
  const authors = await getFirestore()
    .collection("authors")
    .orderBy("slug")
    .startAt(slug)
    .endAt(`${slug}\uf8ff`)
    .get();
  return authors.docs
    .filter((doc) => toVietnameseSlug(String(doc.data().name || "")).includes(slug))
    .map((doc) => doc.id);
}

async function* candidates(
  params: NovelSearchParams,
  title: string,
  authorIds: string[],
): AsyncGenerator<admin.firestore.QueryDocumentSnapshot> {
  const db = getFirestore();
  const novels = db.collection("novels");
  if (title) {
    // A gram narrows substring candidates without excluding titles beyond an
    // arbitrary alphabetic cutoff. Verify the full substring below.
    yield* queryPages(
      novels.where("title_grams", "array-contains", searchGram(title)).orderBy("title_lowercase"),
    );
    return;
  }

  const filter = (authorId?: string) =>
    publicFilterKey({
      authorId,
      genreId: params.genreId,
      translatorId: params.translatorId,
    });
  if (params.author) {
    for (let index = 0; index < authorIds.length; index += 30) {
      const keys = authorIds.slice(index, index + 30).map(filter);
      const query =
        keys.length === 1
          ? novels.where("public_filter_keys", "array-contains", keys[0])
          : novels.where("public_filter_keys", "array-contains-any", keys);
      yield* queryPages(query.orderBy("title_lowercase"));
    }
    return;
  }

  yield* queryPages(
    novels.where("public_filter_keys", "array-contains", filter()).orderBy("title_lowercase"),
  );
}

function compareSearchResults(left: NovelDocument, right: NovelDocument): number {
  return left.title.localeCompare(right.title, "vi") || left.id.localeCompare(right.id);
}

function insertRanked(items: NovelDocument[], item: NovelDocument, keep: number): void {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareSearchResults(items[middle], item) <= 0) low = middle + 1;
    else high = middle;
  }
  if (low >= keep) return;
  items.splice(low, 0, item);
  if (items.length > keep) items.pop();
}

export async function searchNovels(params: NovelSearchParams): Promise<NovelSearchResult> {
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 30);
  const title = normalizeSearchText(params.title || "");
  const author = toVietnameseSlug(params.author || "");
  const authorIds = author ? await matchingAuthorIds(author) : [];
  if (author && authorIds.length === 0) {
    return { items: [], page, limit, total: 0, capped: false };
  }
  if (!title && authorIds.length <= 1) {
    let query: admin.firestore.Query = getFirestore()
      .collection("novels")
      .where(
        "public_filter_keys",
        "array-contains",
        publicFilterKey({
          authorId: authorIds[0],
          genreId: params.genreId,
          translatorId: params.translatorId,
        }),
      )
      .orderBy("title_lowercase");
    const total = (await query.count().get()).data().count;
    if (page > 1) query = query.offset((page - 1) * limit);
    const snapshot = await query.limit(limit).get();
    const items = await enrichNovelsWithRelations(
      snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data())),
    );
    return { items, page, limit, total, capped: false };
  }
  const authorIdSet = new Set(authorIds);
  const seenIds = author && !title ? new Set<string>() : null;
  const ranked: NovelDocument[] = [];
  let total = 0;
  for await (const doc of candidates(params, title, authorIds)) {
    if (seenIds?.has(doc.id)) continue;
    seenIds?.add(doc.id);
    const data = doc.data();
    const novel = novelDocToData(doc.id, data);
    if (novel.publication_status !== "public") continue;
    if (title && !normalizeSearchText(novel.title).includes(title)) continue;
    if (params.translatorId && novel.translator_id !== params.translatorId) continue;
    if (params.genreId && !(data.genre_ids as string[] | undefined)?.includes(params.genreId)) {
      continue;
    }
    if (author && !(data.author_ids as string[] | undefined)?.some((id) => authorIdSet.has(id))) {
      continue;
    }
    total += 1;
    insertRanked(ranked, novel, page * limit);
  }
  const visible = ranked.slice((page - 1) * limit);
  const items = await enrichNovelsWithRelations(visible);

  return {
    items,
    page,
    limit,
    total,
    capped: false,
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
