import type admin from "firebase-admin";
import type { ChapterPublicationStatus, NovelDocument } from "../types/novel.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { requireVietnameseSlug } from "../utils/slug.js";
import { resolveChapterPublication } from "./chapter.js";
import { getFirestore } from "./firebase.js";
import { setNovelAuthors, setNovelGenres } from "./novel-relation.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NovelMetaInput {
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  status?: string;
  publication_status?: "draft" | "public";
  authors?: { name: string; slug?: string }[];
  genres?: { name: string; slug?: string }[];
}

interface ChapterInput {
  index: number;
  title: string;
  content: string;
  access_type?: "free" | "free_auth" | "paid";
  price?: number;
  publication_status?: ChapterPublicationStatus;
  public_at?: string | null;
}

interface UpsertChaptersInput {
  novel_slug: string;
  chapters: ChapterInput[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, NovelDocument["status"]> = {
  full: "completed",
  completed: "completed",
  ongoing: "ongoing",
  hiatus: "hiatus",
};

function mapStatus(status?: string): NovelDocument["status"] {
  if (!status) return "ongoing";
  return STATUS_MAP[status.toLowerCase()] ?? "ongoing";
}

// ─── Upsert Novel Meta ──────────────────────────────────────────────────────

export async function upsertNovelMeta(input: NovelMetaInput): Promise<{
  novel: NovelDocument;
  authors: { id: string; name: string }[];
  genres: { id: string; name: string }[];
}> {
  const db = getFirestore();
  const now = new Date().toISOString();
  const slug = requireVietnameseSlug(input.slug);

  if (!slug) throw new ValidationError("slug is required", { field: "slug" });
  if (!input.title) throw new ValidationError("title is required", { field: "title" });

  // 1. Upsert novel (id = slug)
  const novelRef = db.collection("novels").doc(slug);
  const existingNovel = await novelRef.get();

  const novelData: Record<string, unknown> = {
    slug,
    title: input.title,
    title_lowercase: input.title.trim().toLocaleLowerCase(),
    description: input.description ?? "",
    cover_url: input.cover_url ?? "",
    status: mapStatus(input.status),
    updated_at: now,
  };

  if (!existingNovel.exists) {
    novelData.publication_status = input.publication_status || "draft";
    novelData.chapter_count = 0;
    novelData.public_chapter_count = 0;
    novelData.total_word_count = 0;
    novelData.rating = 0;
    novelData.views = 0;
    novelData.followers = 0;
    novelData.comment_count = 0;
    novelData.price = null;
    novelData.created_at = now;
  }

  await novelRef.set(novelData, { merge: true });
  logger.info("Novel upserted via push", { novelId: slug, title: input.title });

  // 2. Upsert authors
  const authorIds: string[] = [];
  const upsertedAuthors: { id: string; name: string }[] = [];

  if (input.authors && input.authors.length > 0) {
    for (const author of input.authors) {
      if (!author.name) continue;
      const authorSlug = requireVietnameseSlug(author.slug || author.name);
      const authorRef = db.collection("authors").doc(authorSlug);
      const existingAuthor = await authorRef.get();

      const authorData: Record<string, unknown> = {
        name: author.name,
        slug: authorSlug,
        updated_at: now,
      };
      if (!existingAuthor.exists) {
        authorData.bio = "";
        authorData.avatar_url = "";
        authorData.created_at = now;
      }

      await authorRef.set(authorData, { merge: true });
      authorIds.push(authorSlug);
      upsertedAuthors.push({ id: authorSlug, name: author.name });
    }

    await setNovelAuthors(slug, authorIds);
  }

  // 3. Upsert genres
  const genreIds: string[] = [];
  const upsertedGenres: { id: string; name: string }[] = [];

  if (input.genres && input.genres.length > 0) {
    for (const genre of input.genres) {
      if (!genre.name) continue;
      const genreSlug = requireVietnameseSlug(genre.slug || genre.name);
      const genreRef = db.collection("genres").doc(genreSlug);
      const existingGenre = await genreRef.get();

      const genreData: Record<string, unknown> = {
        name: genre.name,
        slug: genreSlug,
      };
      if (!existingGenre.exists) {
        await genreRef.set(genreData);
      } else {
        await genreRef.update({ name: genre.name });
      }

      genreIds.push(genreSlug);
      upsertedGenres.push({ id: genreSlug, name: genre.name });
    }

    await setNovelGenres(slug, genreIds);
  }

  // Build response novel document
  const novel: NovelDocument = {
    id: slug,
    slug,
    title: input.title,
    description: input.description ?? "",
    cover_url: input.cover_url ?? "",
    status: mapStatus(input.status),
    publication_status:
      input.publication_status ??
      (existingNovel.data()?.publication_status === "draft" ? "draft" : "public"),
    chapter_count: (existingNovel.data()?.chapter_count as number) ?? 0,
    public_chapter_count:
      (existingNovel.data()?.public_chapter_count as number) ??
      (existingNovel.data()?.chapter_count as number) ??
      0,
    total_word_count: (existingNovel.data()?.total_word_count as number) ?? 0,
    rating: (existingNovel.data()?.rating as number) ?? 0,
    views: (existingNovel.data()?.views as number) ?? 0,
    followers: (existingNovel.data()?.followers as number) ?? 0,
    comment_count: (existingNovel.data()?.comment_count as number) ?? 0,
    price: (existingNovel.data()?.price as number | null) ?? null,
    is_featured: (existingNovel.data()?.is_featured as boolean) ?? false,
    created_at: (existingNovel.data()?.created_at as string) ?? now,
    updated_at: now,
  };

  return { novel, authors: upsertedAuthors, genres: upsertedGenres };
}

// ─── Upsert Chapters ────────────────────────────────────────────────────────

export async function upsertNovelChapters(input: UpsertChaptersInput): Promise<{
  novel_id: string;
  chapters_upserted: number;
  total_chapters: number;
  total_word_count: number;
}> {
  const db = getFirestore();
  const now = new Date().toISOString();

  if (!input.novel_slug) {
    throw new ValidationError("novel_slug is required", { field: "novel_slug" });
  }
  if (!input.chapters || input.chapters.length === 0) {
    throw new ValidationError("chapters array is required and must not be empty", {
      field: "chapters",
    });
  }

  const novelSlug = requireVietnameseSlug(input.novel_slug, "novel_slug");
  const novelSnapshot = await db.collection("novels").doc(novelSlug).get();

  if (!novelSnapshot.exists) {
    throw new NotFoundError(`Novel with slug "${input.novel_slug}" not found`);
  }

  const novelId = novelSlug;

  // Batch upsert chapters
  const batch = db.batch();

  for (const chapter of input.chapters) {
    if (!chapter.index || chapter.index < 1) {
      throw new ValidationError("Each chapter must have a valid index (>= 1)", {
        field: "chapters",
      });
    }
    if (!chapter.title) {
      throw new ValidationError("Each chapter must have a title", { field: "chapters" });
    }
    if (!chapter.content) {
      throw new ValidationError("Each chapter must have content", { field: "chapters" });
    }

    const wordCount = chapter.content.split(/\s+/).filter(Boolean).length;
    const chapterRef = db
      .collection("novels")
      .doc(novelId)
      .collection("chapters")
      .doc(String(chapter.index));

    const existingChapter = await chapterRef.get();
    const existingData = existingChapter.data();

    const chapterData: Record<string, unknown> = {
      index: chapter.index,
      title: chapter.title,
      content: chapter.content,
      word_count: wordCount,
      access_type: chapter.access_type ?? "free",
      price: chapter.access_type === "paid" ? (chapter.price ?? 0) : 0,
      updated_at: now,
    };

    if (
      !existingChapter.exists ||
      !existingData?.publication_status ||
      chapter.publication_status !== undefined ||
      chapter.public_at !== undefined
    ) {
      const existingPublication = existingChapter.exists
        ? {
            publication_status:
              existingData?.publication_status === "draft" ||
              existingData?.publication_status === "scheduled"
                ? existingData.publication_status
                : ("public" as const),
            public_at:
              existingData?.public_at ??
              existingData?.created_at ??
              existingData?.updated_at ??
              now,
          }
        : undefined;
      Object.assign(
        chapterData,
        resolveChapterPublication(
          {
            publication_status: chapter.publication_status,
            public_at: chapter.public_at,
          },
          now,
          existingPublication,
        ),
      );
    }

    if (!existingChapter.exists) {
      chapterData.created_at = now;
    }

    batch.set(chapterRef, chapterData, { merge: true });
  }

  await batch.commit();
  logger.info("Chapters upserted via push", {
    novelId,
    count: input.chapters.length,
  });

  // Recalculate novel counters
  const allChapters = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .select("word_count", "publication_status")
    .get();

  let totalWordCount = 0;
  let publicChapterCount = 0;
  for (const doc of allChapters.docs) {
    const data = doc.data();
    totalWordCount += (data.word_count as number) || 0;
    if (data.publication_status !== "draft" && data.publication_status !== "scheduled") {
      publicChapterCount += 1;
    }
  }

  await db.collection("novels").doc(novelId).update({
    chapter_count: allChapters.size,
    public_chapter_count: publicChapterCount,
    total_word_count: totalWordCount,
    updated_at: now,
  });

  return {
    novel_id: novelId,
    chapters_upserted: input.chapters.length,
    total_chapters: allChapters.size,
    total_word_count: totalWordCount,
  };
}
