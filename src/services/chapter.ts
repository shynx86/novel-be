import admin from "firebase-admin";
import type {
  ChapterCreateInput,
  ChapterDocument,
  ChapterPublicationStatus,
  ChapterUpdateInput,
  NewestChapterDocument,
  PaginatedResult,
} from "../types/novel.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";
import { getNovel } from "./novel.js";

function chapterDocToData(data: admin.firestore.DocumentData): ChapterDocument {
  // Chapters created before scheduling existed were immediately public.
  const publicationStatus: ChapterPublicationStatus =
    data.publication_status === "draft" || data.publication_status === "scheduled"
      ? data.publication_status
      : "public";
  return {
    index: data.index,
    title: data.title,
    content: data.content,
    word_count: data.word_count,
    access_type: data.access_type,
    price: data.price || 0,
    publication_status: publicationStatus,
    public_at:
      data.public_at ??
      (publicationStatus === "public" ? (data.created_at ?? data.updated_at) : null),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

function parsePublicAt(value: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError("public_at must be a valid ISO 8601 datetime with timezone", {
      field: "public_at",
    });
  }
  return new Date(value).toISOString();
}

export function resolveChapterPublication(
  input: Pick<ChapterCreateInput, "publication_status" | "public_at">,
  now: string,
  existing?: Pick<ChapterDocument, "publication_status" | "public_at">,
): { publication_status: ChapterPublicationStatus; public_at: string | null } {
  const requestedStatus = input.publication_status;
  const hasPublicAt = input.public_at !== undefined;

  if (!requestedStatus && !hasPublicAt) {
    return existing
      ? { publication_status: existing.publication_status, public_at: existing.public_at }
      : { publication_status: "public", public_at: now };
  }

  if (!requestedStatus) {
    if (input.public_at === null) return { publication_status: "draft", public_at: null };
    const publicAt = parsePublicAt(input.public_at as string);
    return {
      publication_status: publicAt > now ? "scheduled" : "public",
      public_at: publicAt,
    };
  }

  if (requestedStatus === "draft") {
    return { publication_status: "draft", public_at: null };
  }

  if (requestedStatus === "scheduled") {
    const candidate = hasPublicAt ? input.public_at : existing?.public_at;
    if (!candidate) {
      throw new ValidationError("public_at is required for a scheduled chapter", {
        field: "public_at",
      });
    }
    const publicAt = parsePublicAt(candidate);
    if (publicAt <= now) {
      throw new ValidationError("public_at must be in the future for a scheduled chapter", {
        field: "public_at",
      });
    }
    return { publication_status: "scheduled", public_at: publicAt };
  }

  let publicAt: string;
  if (hasPublicAt && input.public_at) {
    publicAt = parsePublicAt(input.public_at);
  } else if (existing?.publication_status === "public" && existing.public_at) {
    publicAt = existing.public_at;
  } else {
    publicAt = now;
  }
  if (publicAt > now) {
    throw new ValidationError("A public chapter cannot have public_at in the future", {
      field: "public_at",
    });
  }
  return { publication_status: "public", public_at: publicAt };
}

export function isChapterPublic(chapter: ChapterDocument, now = new Date()): boolean {
  return (
    chapter.publication_status === "public" &&
    chapter.public_at !== null &&
    Date.parse(chapter.public_at) <= now.getTime()
  );
}

function nextPublicChapterCount(
  novelData: admin.firestore.DocumentData | undefined,
  delta: number,
): number | admin.firestore.FieldValue {
  if (typeof novelData?.public_chapter_count === "number") {
    return admin.firestore.FieldValue.increment(delta);
  }
  // Before the publication migration, every existing chapter was public.
  return Math.max(0, Number(novelData?.chapter_count ?? 0) + delta);
}

export async function getChapter(novelId: string, index: number): Promise<ChapterDocument> {
  const db = getFirestore();
  const doc = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .get();

  if (!doc.exists) {
    throw new NotFoundError("Chapter not found");
  }

  const data = doc.data();
  if (!data) throw new NotFoundError("Chapter not found");
  return chapterDocToData(data);
}

export async function getPublicChapter(novelId: string, index: number): Promise<ChapterDocument> {
  const chapter = await getChapter(novelId, index);
  if (!isChapterPublic(chapter)) throw new NotFoundError("Chapter not found");
  return chapter;
}

export async function getChapterMeta(
  novelId: string,
  index: number,
): Promise<Omit<ChapterDocument, "content">> {
  const db = getFirestore();
  const doc = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .get();

  if (!doc.exists) {
    throw new NotFoundError("Chapter not found");
  }

  const data = doc.data();
  if (!data) throw new NotFoundError("Chapter not found");
  return {
    index: data.index,
    title: data.title,
    word_count: data.word_count,
    access_type: data.access_type,
    price: data.price || 0,
    publication_status:
      data.publication_status === "draft" || data.publication_status === "scheduled"
        ? data.publication_status
        : "public",
    public_at:
      data.public_at ??
      (data.publication_status === "draft" || data.publication_status === "scheduled"
        ? null
        : (data.created_at ?? data.updated_at)),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listChapters(
  novelId: string,
  params: { page?: number; limit?: number; includeContent?: boolean; publicOnly?: boolean },
): Promise<PaginatedResult<Omit<ChapterDocument, "content"> & { content?: string }>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);

  // Verify novel exists
  await getNovel(novelId);

  let query: admin.firestore.Query = db.collection("novels").doc(novelId).collection("chapters");

  if (params.publicOnly) {
    query = query.where("publication_status", "==", "public");
  }

  // Select fields if content not needed
  if (!params.includeContent) {
    query = query.select(
      "index",
      "title",
      "word_count",
      "access_type",
      "price",
      "publication_status",
      "public_at",
      "created_at",
      "updated_at",
    );
  }

  // Get total count
  let countQuery: admin.firestore.Query = db
    .collection("novels")
    .doc(novelId)
    .collection("chapters");
  if (params.publicOnly) {
    countQuery = countQuery.where("publication_status", "==", "public");
  }
  const totalCount = await countQuery.count().get();
  const total = totalCount.data().count;

  // Order and paginate
  query = query.orderBy("index", "asc");

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const chapters = snapshot.docs
    .map((doc) => doc.data())
    .filter((data): data is admin.firestore.DocumentData => !!data)
    .map((data) => {
      const base = {
        index: data.index,
        title: data.title,
        word_count: data.word_count,
        access_type: data.access_type,
        price: data.price || 0,
        publication_status:
          data.publication_status === "draft" || data.publication_status === "scheduled"
            ? data.publication_status
            : "public",
        public_at:
          data.public_at ??
          (data.publication_status === "draft" || data.publication_status === "scheduled"
            ? null
            : (data.created_at ?? data.updated_at)),
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      if (params.includeContent) {
        return { ...base, content: data.content };
      }
      return base;
    });

  return { items: chapters, page, limit, total };
}

export async function listNewestChapters(
  limit = 10,
  search?: string,
): Promise<NewestChapterDocument[]> {
  const db = getFirestore();
  const candidateLimit = Math.min(Math.max(limit * 10, 50), 100);
  const snapshot = await db
    .collectionGroup("chapters")
    .where("publication_status", "==", "public")
    .select("index", "title", "access_type", "price", "public_at", "updated_at")
    .orderBy("public_at", "desc")
    .limit(candidateLimit)
    .get();

  const candidates = snapshot.docs
    .map((doc) => ({ doc, novelId: doc.ref.parent.parent?.id }))
    .filter(
      (candidate): candidate is { doc: admin.firestore.QueryDocumentSnapshot; novelId: string } =>
        Boolean(candidate.novelId),
    );
  const uniqueNovelIds = [...new Set(candidates.map((candidate) => candidate.novelId))];
  const novelDocs = uniqueNovelIds.length
    ? await db.getAll(...uniqueNovelIds.map((id) => db.collection("novels").doc(id)))
    : [];
  const novelsById = new Map(
    novelDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()]),
  );
  const normalizedSearch = search?.trim().toLowerCase();

  return candidates
    .map(({ doc, novelId }) => {
      const novel = novelsById.get(novelId);
      if (!novel || novel.publication_status === "draft") return null;
      if (
        normalizedSearch &&
        !String(novel.title || "")
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return null;
      }

      const chapter = doc.data();
      return {
        novel_id: novelId,
        novel_slug: novel.slug || novelId,
        novel_title: novel.title,
        index: chapter.index,
        title: chapter.title,
        access_type: chapter.access_type,
        price: chapter.price || 0,
        public_at: chapter.public_at,
        updated_at: chapter.updated_at,
      };
    })
    .filter((chapter): chapter is NewestChapterDocument => chapter !== null)
    .slice(0, limit);
}

export async function createChapter(
  novelId: string,
  input: ChapterCreateInput,
): Promise<ChapterDocument> {
  const db = getFirestore();
  const wordCount = input.content.split(/\s+/).filter(Boolean).length;

  // Use transaction to atomically assign index + create chapter + update counters
  const result = await db.runTransaction(async (transaction) => {
    const now = new Date().toISOString();
    const publication = resolveChapterPublication(input, now);
    const novelRef = db.collection("novels").doc(novelId);

    // Auto-assign index (max existing + 1)
    const existingChapters = await transaction.get(
      db.collection("novels").doc(novelId).collection("chapters").orderBy("index", "desc").limit(1),
    );
    const novelDoc = await transaction.get(novelRef);

    const nextIndex = existingChapters.empty ? 1 : (existingChapters.docs[0].data().index || 0) + 1;

    const accessType = input.access_type ?? (nextIndex <= 10 ? "free" : "free_auth");

    const chapterData = {
      index: nextIndex,
      title: input.title,
      content: input.content,
      word_count: wordCount,
      access_type: accessType,
      price: accessType === "paid" ? input.price || 0 : 0,
      ...publication,
      created_at: now,
      updated_at: now,
    };

    const chapterRef = db
      .collection("novels")
      .doc(novelId)
      .collection("chapters")
      .doc(String(nextIndex));
    transaction.set(chapterRef, chapterData);

    // Update novel counters
    transaction.update(novelRef, {
      chapter_count: admin.firestore.FieldValue.increment(1),
      public_chapter_count: nextPublicChapterCount(
        novelDoc.data?.(),
        publication.publication_status === "public" ? 1 : 0,
      ),
      total_word_count: admin.firestore.FieldValue.increment(wordCount),
      updated_at: now,
    });

    return { chapterData, nextIndex };
  });

  logger.info("Chapter created", { novelId, index: result.nextIndex });

  return chapterDocToData(result.chapterData);
}

export async function updateChapter(
  novelId: string,
  index: number,
  input: ChapterUpdateInput,
): Promise<ChapterDocument> {
  const db = getFirestore();
  const chapterRef = db.collection("novels").doc(novelId).collection("chapters").doc(String(index));
  const novelRef = db.collection("novels").doc(novelId);
  const updatedChapter = await db.runTransaction(async (transaction) => {
    const chapterDoc = await transaction.get(chapterRef);
    const chapterData = chapterDoc.data();
    if (!chapterDoc.exists || !chapterData) throw new NotFoundError("Chapter not found");
    const novelDoc = await transaction.get(novelRef);
    const novelData = novelDoc.data?.();

    const existing = chapterDocToData(chapterData);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    let wordCountDelta = 0;

    if (input.title !== undefined) updates.title = input.title;
    if (input.content !== undefined) {
      updates.content = input.content;
      const newWordCount = input.content.split(/\s+/).filter(Boolean).length;
      updates.word_count = newWordCount;
      wordCountDelta = newWordCount - existing.word_count;
    }
    if (input.access_type !== undefined) updates.access_type = input.access_type;
    if (input.price !== undefined) updates.price = input.price;
    if (input.publication_status !== undefined || input.public_at !== undefined) {
      Object.assign(updates, resolveChapterPublication(input, now, existing));
    }

    transaction.update(chapterRef, updates);
    const publicCountDelta =
      Number(
        updates.publication_status === "public" ||
          (updates.publication_status === undefined && existing.publication_status === "public"),
      ) - Number(existing.publication_status === "public");
    if (
      wordCountDelta !== 0 ||
      publicCountDelta !== 0 ||
      typeof novelData?.public_chapter_count !== "number"
    ) {
      transaction.update(novelRef, {
        ...(wordCountDelta !== 0
          ? { total_word_count: admin.firestore.FieldValue.increment(wordCountDelta) }
          : {}),
        public_chapter_count: nextPublicChapterCount(novelData, publicCountDelta),
        updated_at: now,
      });
    }

    return { ...existing, ...updates } as ChapterDocument;
  });

  logger.info("Chapter updated", { novelId, index });

  return updatedChapter;
}

export async function deleteChapter(novelId: string, index: number): Promise<void> {
  const db = getFirestore();
  const chapterRef = db.collection("novels").doc(novelId).collection("chapters").doc(String(index));
  const novelRef = db.collection("novels").doc(novelId);
  await db.runTransaction(async (transaction) => {
    const chapterDoc = await transaction.get(chapterRef);
    const chapterData = chapterDoc.data();
    if (!chapterDoc.exists || !chapterData) throw new NotFoundError("Chapter not found");
    const novelDoc = await transaction.get(novelRef);
    const novelData = novelDoc.data?.();

    const existing = chapterDocToData(chapterData);
    transaction.delete(chapterRef);
    transaction.update(novelRef, {
      chapter_count: admin.firestore.FieldValue.increment(-1),
      public_chapter_count: nextPublicChapterCount(
        novelData,
        existing.publication_status === "public" ? -1 : 0,
      ),
      total_word_count: admin.firestore.FieldValue.increment(-existing.word_count),
      updated_at: new Date().toISOString(),
    });
  });

  logger.info("Chapter deleted", { novelId, index });
}
