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
import { getNovelAuthors, getNovelGenres } from "./novel-relation.js";

function novelDocToData(id: string, data: admin.firestore.DocumentData): NovelDocument {
  return {
    id,
    slug: data.slug || id,
    title: data.title,
    description: data.description,
    cover_url: data.cover_url,
    status: data.status,
    chapter_count: data.chapter_count || 0,
    total_word_count: data.total_word_count || 0,
    rating: data.rating ?? 0,
    views: data.views ?? 0,
    followers: data.followers ?? 0,
    comment_count: data.comment_count ?? 0,
    price: data.price ?? null,
    is_featured: data.is_featured ?? false,
    translator_id: data.translator_id ?? undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function enrichNovelWithRelations(novel: NovelDocument): Promise<NovelDocument> {
  const db = getFirestore();
  const [authors, genres] = await Promise.all([
    getNovelAuthors(novel.id),
    getNovelGenres(novel.id),
  ]);

  let translator: { id: string; name: string } | undefined;
  if (novel.translator_id) {
    try {
      const userDoc = await db.collection("users").doc(novel.translator_id).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        translator = {
          id: novel.translator_id,
          name: userData?.display_name || userData?.email || "",
        };
      }
    } catch {
      // Ignore error if user not found
    }
  }

  return {
    ...novel,
    authors: authors.map((a) => ({ id: a.author_id, name: a.author_name })),
    genres: genres.map((g) => ({ id: g.genre_id, name: g.genre_name })),
    translator,
  };
}

export async function createNovel(input: NovelCreateInput): Promise<NovelDocument> {
  const db = getFirestore();
  const now = new Date().toISOString();

  const docData: Record<string, unknown> = {
    slug: input.slug,
    title: input.title,
    description: input.description || "",
    cover_url: input.cover_url || "",
    status: input.status || "ongoing",
    chapter_count: 0,
    total_word_count: 0,
    rating: input.rating ?? 0,
    views: input.views ?? 0,
    followers: input.followers ?? 0,
    comment_count: 0,
    price: input.price !== undefined ? input.price : null,
    is_featured: false,
    created_at: now,
    updated_at: now,
  };

  if (input.translator_id) {
    docData.translator_id = input.translator_id;
  }

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
  const db = getFirestore();

  // Get the novel's genre relations
  const genreSnapshot = await db.collection("novel_genres").where("novel_id", "==", novelId).get();

  if (genreSnapshot.empty) return [];

  const genreIds = genreSnapshot.docs.map((d) => d.data().genre_id as string);
  const targetGenreId = genreIds[genreIndex];
  if (!targetGenreId) return [];

  // Find other novels that share this genre
  const novelGenreSnapshot = await db
    .collection("novel_genres")
    .where("genre_id", "==", targetGenreId)
    .limit(limit + 1)
    .get();

  const relatedNovelIds = novelGenreSnapshot.docs
    .map((d) => d.data().novel_id as string)
    .filter((id) => id !== novelId)
    .slice(0, limit);

  if (relatedNovelIds.length === 0) return [];

  // Fetch the related novels
  const novelRefs = relatedNovelIds.map((id) => db.collection("novels").doc(id));
  const novelDocs = await db.getAll(...novelRefs);

  return (
    novelDocs
      .filter((doc) => doc.exists && doc.data())
      // biome-ignore lint/style/noNonNullAssertion: filter guarantees data() exists
      .map((doc) => novelDocToData(doc.id, doc.data()!))
  );
}

function getOrderByValue(novel: NovelDocument, field: string): string {
  const record = novel as unknown as Record<string, unknown>;
  const val = record[field];
  return val == null ? "" : String(val);
}

function matchesFilters(
  novel: NovelDocument,
  filters: { field: string; value: string | boolean }[],
): boolean {
  const record = novel as unknown as Record<string, unknown>;
  for (const f of filters) {
    if (record[f.field] !== f.value) return false;
  }
  return true;
}

async function searchNovels(params: {
  search?: string;
  filters?: { field: string; value: string | boolean }[];
  orderByField: string;
  page: number;
  limit: number;
}): Promise<PaginatedResult<NovelDocument>> {
  const db = getFirestore();
  const { search, filters, orderByField, page, limit } = params;

  if (!search) {
    let query: admin.firestore.Query = db.collection("novels");
    for (const f of filters ?? []) {
      query = query.where(f.field, "==", f.value);
    }
    query = query.orderBy(orderByField, "desc");

    const totalCount = await query.count().get();
    const total = totalCount.data().count;

    if (page > 1) {
      query = query.offset((page - 1) * limit);
    }

    const snapshot = await query.limit(limit).get();
    const novels = snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));
    const enriched = await Promise.all(novels.map(enrichNovelWithRelations));
    return { items: enriched, page, limit, total };
  }

  const lowerSearch = search.toLowerCase();
  let query: admin.firestore.Query = db
    .collection("novels")
    .orderBy("title")
    .startAt(lowerSearch)
    .endAt(`${lowerSearch}\uf8ff`);

  const snapshot = await query.get();
  let novels = snapshot.docs
    .map((doc) => novelDocToData(doc.id, doc.data()))
    .filter((novel) => matchesFilters(novel, filters ?? []));

  novels.sort((a, b) => {
    const aVal = getOrderByValue(a, orderByField);
    const bVal = getOrderByValue(b, orderByField);
    return bVal.localeCompare(aVal);
  });

  const total = novels.length;
  const paginated = novels.slice((page - 1) * limit, page * limit);
  const enriched = await Promise.all(paginated.map(enrichNovelWithRelations));
  return { items: enriched, page, limit, total };
}

export async function getTrendingNovels(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResult<NovelDocument>> {
  return searchNovels({ search, orderByField: "views", page, limit });
}

export async function getCompletedNovels(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResult<NovelDocument>> {
  return searchNovels({
    search,
    filters: [{ field: "status", value: "completed" }],
    orderByField: "updated_at",
    page,
    limit,
  });
}

export async function getFeaturedNovels(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResult<NovelDocument>> {
  return searchNovels({
    search,
    filters: [{ field: "is_featured", value: true }],
    orderByField: "views",
    page,
    limit,
  });
}

export async function getCompletedFeaturedNovels(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResult<NovelDocument>> {
  return searchNovels({
    search,
    filters: [
      { field: "status", value: "completed" },
      { field: "is_featured", value: true },
    ],
    orderByField: "views",
    page,
    limit,
  });
}

export async function getNewestNovels(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResult<NovelDocument>> {
  return searchNovels({ search, orderByField: "created_at", page, limit });
}

export type NovelSortBy = "created_at" | "updated_at" | "title" | "views" | "rating";
export type SortOrder = "asc" | "desc";

export async function listNovels(params: {
  page?: number;
  limit?: number;
  status?: string;
  author_id?: string;
  translator_id?: string;
  genre_id?: string;
  search?: string;
  sort_by?: NovelSortBy;
  sort_order?: SortOrder;
}): Promise<PaginatedResult<NovelDocument>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  // If junction filters are provided, get novel IDs from junction collections first
  const hasJunctionFilter = params.author_id || params.genre_id;

  if (hasJunctionFilter) {
    let novelIds: string[] | null = null;

    if (params.author_id) {
      const snapshot = await db
        .collection("novel_authors")
        .where("author_id", "==", params.author_id)
        .get();
      novelIds = snapshot.docs.map((d) => d.data().novel_id as string);
    }

    if (params.genre_id) {
      const snapshot = await db
        .collection("novel_genres")
        .where("genre_id", "==", params.genre_id)
        .get();
      const genreNovelIds = snapshot.docs.map((d) => d.data().novel_id as string);
      novelIds = novelIds ? novelIds.filter((id) => genreNovelIds.includes(id)) : genreNovelIds;
    }

    // Apply translator_id filter (direct field)
    if (params.translator_id) {
      if (novelIds) {
        // Filter existing novelIds by translator_id
        const novelRefs = novelIds.map((id) => db.collection("novels").doc(id));
        const novelDocs = await db.getAll(...novelRefs);
        novelIds = novelDocs
          .filter((doc) => doc.exists && doc.data()?.translator_id === params.translator_id)
          .map((doc) => doc.id);
      } else {
        // Query directly by translator_id
        const snapshot = await db
          .collection("novels")
          .where("translator_id", "==", params.translator_id)
          .select()
          .get();
        novelIds = snapshot.docs.map((d) => d.id);
      }
    }

    if (!novelIds || novelIds.length === 0) {
      return { items: [], page, limit, total: 0 };
    }

    // Apply status filter if provided
    let filteredIds = novelIds;
    if (params.status) {
      const statusSnapshot = await db
        .collection("novels")
        .where("status", "==", params.status)
        .select()
        .get();
      const statusIds = new Set(statusSnapshot.docs.map((d) => d.id));
      filteredIds = novelIds.filter((id) => statusIds.has(id));
    }

    const total = filteredIds.length;
    const paginatedIds = filteredIds.slice((page - 1) * limit, page * limit);

    if (paginatedIds.length === 0) {
      return { items: [], page, limit, total };
    }

    // Fetch novels
    const novelRefs = paginatedIds.map((id) => db.collection("novels").doc(id));
    const novelDocs = await db.getAll(...novelRefs);
    const novels = novelDocs
      .filter((doc) => doc.exists && doc.data())
      // biome-ignore lint/style/noNonNullAssertion: filter guarantees data() exists
      .map((doc) => novelDocToData(doc.id, doc.data()!));

    return { items: novels, page, limit, total };
  }

  // Standard query without junction filters
  if (params.search) {
    const lowerSearch = params.search.toLowerCase();
    let query: admin.firestore.Query = db
      .collection("novels")
      .orderBy("title")
      .startAt(lowerSearch)
      .endAt(`${lowerSearch}\uf8ff`);

    const snapshot = await query.get();
    let novels = snapshot.docs
      .map((doc) => novelDocToData(doc.id, doc.data()))
      .filter((novel) => {
        if (params.status && novel.status !== params.status) return false;
        if (params.translator_id && novel.translator_id !== params.translator_id) return false;
        return true;
      });

    const sortBy = params.sort_by || "created_at";
    const sortOrder = params.sort_order || "desc";
    novels.sort((a, b) => {
      const aVal = a[sortBy] ?? "";
      const bVal = b[sortBy] ?? "";
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortOrder === "desc" ? -cmp : cmp;
    });

    const total = novels.length;
    const paginated = novels.slice((page - 1) * limit, page * limit);
    return { items: paginated, page, limit, total };
  }

  let query: admin.firestore.Query = db.collection("novels");

  if (params.status) {
    query = query.where("status", "==", params.status);
  }

  if (params.translator_id) {
    query = query.where("translator_id", "==", params.translator_id);
  }

  // Get total count
  const totalCount = await query.count().get();
  const total = totalCount.data().count;

  // Apply ordering and pagination
  const sortBy = params.sort_by || "created_at";
  const sortOrder = params.sort_order || "desc";

  // Note: Firestore requires composite index for where + orderBy on different fields
  // For translator_id queries, we skip orderBy to avoid index issues
  if (!params.translator_id) {
    query = query.orderBy(sortBy, sortOrder);
  }

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  let novels = snapshot.docs.map((doc) => novelDocToData(doc.id, doc.data()));

  // Sort manually when translator_id filter is used
  if (params.translator_id) {
    const sortBy = params.sort_by || "created_at";
    const sortOrder = params.sort_order || "desc";
    novels.sort((a, b) => {
      const aVal = a[sortBy] ?? "";
      const bVal = b[sortBy] ?? "";
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }

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
  if (input.cover_url !== undefined) updates.cover_url = input.cover_url;
  if (input.status !== undefined) updates.status = input.status;
  if (input.rating !== undefined) updates.rating = input.rating;
  if (input.views !== undefined) updates.views = input.views;
  if (input.followers !== undefined) updates.followers = input.followers;
  if (input.price !== undefined) updates.price = input.price;
  if (input.is_featured !== undefined) updates.is_featured = input.is_featured;
  if (input.translator_id !== undefined) updates.translator_id = input.translator_id;

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
