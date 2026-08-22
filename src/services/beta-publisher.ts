import admin from "firebase-admin";
import type { BetaChapterDocument, BetaSourceChapterDocument } from "../types/beta.js";
import type { ChapterDocument } from "../types/novel.js";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  getBetaChapter,
  getBetaChapterRef,
  getBetaRun,
  getRunRef,
  getSourceChapter,
  hashContent,
} from "./beta-run.js";
import { getFirestore } from "./firebase.js";

const MAX_PUBLISH_PAYLOAD_BYTES = 8 * 1024 * 1024;

export interface PublishBetaResult {
  runId: string;
  status: string;
  published_chapter_indexes: number[];
  total_word_count: number;
}

async function loadAllBetaChapters(novelId: string, runId: string): Promise<BetaChapterDocument[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("novels")
    .doc(novelId)
    .collection("beta_runs")
    .doc(runId)
    .collection("beta_chapters")
    .orderBy("index", "asc")
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      index: data.index,
      title: data.title,
      content: data.content ?? null,
      word_count: data.word_count ?? null,
      status: data.status,
      source_hash: data.source_hash,
      attempt_count: data.attempt_count ?? 0,
      model: data.model ?? "",
      usage: data.usage ?? null,
      processing_started_at: data.processing_started_at ?? null,
      completed_at: data.completed_at ?? null,
      published_at: data.published_at ?? null,
      error: data.error ?? null,
    } as BetaChapterDocument;
  });
}

async function loadCanonicalChapter(novelId: string, index: number): Promise<ChapterDocument> {
  const db = getFirestore();
  const doc = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .doc(String(index))
    .get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Chapter not found");
  return {
    index: data.index,
    title: data.title,
    content: data.content,
    word_count: data.word_count,
    access_type: data.access_type,
    price: data.price || 0,
    publication_status:
      data.publication_status === "draft" || data.publication_status === "scheduled"
        ? data.publication_status
        : "public",
    public_at: data.public_at ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  } as ChapterDocument;
}

export async function publishBetaRun(
  novelId: string,
  runId: string,
  publishedBy: string,
): Promise<PublishBetaResult> {
  const db = getFirestore();
  const run = await getBetaRun(novelId, runId);

  if (run.status === "published") {
    return {
      runId,
      status: "published",
      published_chapter_indexes: run.chapter_indexes,
      total_word_count: 0,
    };
  }

  if (run.status !== "review_ready") {
    throw new ValidationError("Beta run is not ready to publish", {
      code: "BETA_RUN_NOT_READY",
      status: run.status,
    });
  }

  const [betaChapters, sourceChapters] = await Promise.all([
    loadAllBetaChapters(novelId, runId),
    Promise.all(run.chapter_indexes.map((index) => getSourceChapter(novelId, runId, index))),
  ]);

  if (betaChapters.length < run.target_count) {
    throw new ValidationError("Beta run is incomplete", {
      code: "BETA_INCOMPLETE",
    });
  }

  const completedByIndex = new Map(betaChapters.map((chapter) => [chapter.index, chapter]));
  const incomplete = run.chapter_indexes.filter(
    (index) => completedByIndex.get(index)?.status !== "completed",
  );
  if (incomplete.length > 0) {
    throw new ValidationError("Not all beta chapters are completed", {
      code: "BETA_INCOMPLETE",
      chapter_indexes: incomplete,
    });
  }

  // Compare canonical chapter content against the snapshot hash.
  const sourceByIndex = new Map(sourceChapters.map((chapter) => [chapter.index, chapter]));
  const changedIndexes: number[] = [];
  for (const chapter of betaChapters) {
    const canonical = await loadCanonicalChapter(novelId, chapter.index);
    const source = sourceByIndex.get(chapter.index);
    if (hashContent(canonical.content) !== source?.source_hash) {
      changedIndexes.push(chapter.index);
    }
  }
  if (changedIndexes.length > 0) {
    throw new ConflictError("One or more chapters changed after the Beta was created", {
      code: "BETA_SOURCE_CHANGED",
      chapter_indexes: changedIndexes,
    });
  }

  // Estimate total payload size before committing so readers never see a partial publish.
  const totalOutputBytes = betaChapters.reduce(
    (total, chapter) => total + (chapter.content?.length ?? 0),
    0,
  );
  if (totalOutputBytes > MAX_PUBLISH_PAYLOAD_BYTES) {
    throw new ValidationError("Beta output is too large to publish in one operation", {
      code: "BETA_PUBLISH_PAYLOAD_TOO_LARGE",
    });
  }

  const now = new Date().toISOString();

  // Compute delta against current canonical word counts.
  let computedDelta = 0;
  for (const chapter of betaChapters) {
    const canonical = await loadCanonicalChapter(novelId, chapter.index);
    computedDelta += (chapter.word_count ?? 0) - canonical.word_count;
  }

  const batch = db.batch();

  // Update canonical chapters (keep index/access_type/price/publication/public_at).
  for (const chapter of betaChapters) {
    if (chapter.content === null) continue;
    batch.update(
      db.collection("novels").doc(novelId).collection("chapters").doc(String(chapter.index)),
      {
        content: chapter.content,
        word_count: chapter.word_count ?? 0,
        updated_at: now,
      },
    );
    batch.update(getBetaChapterRef(novelId, runId, chapter.index), {
      status: "published",
      published_at: now,
    });
  }

  batch.update(getRunRef(novelId, runId), {
    status: "published",
    published_by: publishedBy,
    published_at: now,
    completed_at: now,
  });

  const novelRef = db.collection("novels").doc(novelId);
  const novelDoc = await novelRef.get();
  const novelData = novelDoc.data();
  const currentTotalWordCount = novelData?.total_word_count ?? 0;

  batch.update(novelRef, {
    total_word_count: admin.firestore.FieldValue.increment(computedDelta),
    has_published_beta: true,
    latest_beta_run_id: runId,
    beta_status: "published",
    beta_updated_at: now,
    beta_last_published_at: now,
  });

  await batch.commit();

  logger.info("Beta run published", {
    novelId,
    runId,
    actorId: publishedBy,
    chapterCount: betaChapters.length,
    wordCountDelta: computedDelta,
  });

  return {
    runId,
    status: "published",
    published_chapter_indexes: betaChapters.map((chapter) => chapter.index),
    total_word_count: currentTotalWordCount + computedDelta,
  };
}
