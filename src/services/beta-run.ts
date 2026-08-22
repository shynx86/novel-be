import { createHash, randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { env } from "../config/env.js";
import type {
  BetaChapterComparison,
  BetaChapterDocument,
  BetaError,
  BetaRunCreateResult,
  BetaRunDocument,
  BetaRunStatus,
  BetaSourceChapterDocument,
} from "../types/beta.js";
import type { ChapterDocument, PaginatedResult } from "../types/novel.js";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { DEFAULT_CUSTOM_PROMPT } from "./ai/beta-prompt.js";
import { getFirestore } from "./firebase.js";
import { getNovel } from "./novel.js";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

export function getRunRef(novelId: string, runId: string) {
  return getFirestore().collection("novels").doc(novelId).collection("beta_runs").doc(runId);
}

export function getSourceChapterRef(novelId: string, runId: string, index: number) {
  return getRunRef(novelId, runId).collection("source_chapters").doc(String(index));
}

export function getBetaChapterRef(novelId: string, runId: string, index: number) {
  return getRunRef(novelId, runId).collection("beta_chapters").doc(String(index));
}

export function betaRunDocToData(id: string, data: admin.firestore.DocumentData): BetaRunDocument {
  return {
    id,
    novel_id: data.novel_id,
    status: data.status,
    chapter_indexes: Array.isArray(data.chapter_indexes) ? data.chapter_indexes : [],
    target_count: data.target_count ?? 0,
    completed_count: data.completed_count ?? 0,
    failed_count: data.failed_count ?? 0,
    current_chapter_index: data.current_chapter_index ?? null,
    custom_prompt: data.custom_prompt ?? "",
    prompt_template_version: data.prompt_template_version ?? "",
    prompt_hash: data.prompt_hash ?? "",
    provider: data.provider ?? "deepseek",
    model: data.model ?? "",
    requested_by: data.requested_by ?? "",
    created_at: data.created_at,
    started_at: data.started_at ?? null,
    completed_at: data.completed_at ?? null,
    published_by: data.published_by ?? null,
    published_at: data.published_at ?? null,
    cancelled_by: data.cancelled_by ?? null,
    cancelled_at: data.cancelled_at ?? null,
    error: data.error ?? null,
  };
}

export function betaChapterDocToData(data: admin.firestore.DocumentData): BetaChapterDocument {
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
  };
}

export function sourceChapterDocToData(
  data: admin.firestore.DocumentData,
): BetaSourceChapterDocument {
  return {
    index: data.index,
    title: data.title,
    content: data.content,
    word_count: data.word_count,
    source_hash: data.source_hash,
    source_updated_at: data.source_updated_at,
    created_at: data.created_at,
  };
}

function validateCustomPrompt(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ValidationError("custom_prompt must be a string", { field: "custom_prompt" });
  }
  const trimmed = value.trim();
  if (trimmed.length > env.betaCustomPromptMaxLength) {
    throw new ValidationError(
      `custom_prompt must not exceed ${env.betaCustomPromptMaxLength} characters`,
      { field: "custom_prompt", max: env.betaCustomPromptMaxLength },
    );
  }
  return trimmed;
}

async function selectBetaChapters(novelId: string): Promise<ChapterDocument[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("novels")
    .doc(novelId)
    .collection("chapters")
    .orderBy("index", "asc")
    .limit(env.betaMaxChapters)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      index: data.index,
      title: data.title,
      content: data.content,
      word_count: data.word_count,
      access_type: data.access_type,
      price: data.price || 0,
      publication_status: data.publication_status,
      public_at: data.public_at ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    } as ChapterDocument;
  });
}

export async function createBetaRun(
  novelId: string,
  input: { custom_prompt?: string },
  requestedBy: string,
): Promise<BetaRunCreateResult> {
  const db = getFirestore();
  const novel = await getNovel(novelId);
  const now = new Date().toISOString();
  const previousLatestRunId = novel.latest_beta_run_id ?? null;
  const previousBetaStatus = novel.beta_status ?? "not_started";
  const previousBetaUpdatedAt = novel.beta_updated_at ?? null;

  if (novel.active_beta_run_id) {
    throw new ConflictError("Novel already has an active beta run", {
      active_beta_run_id: novel.active_beta_run_id,
    });
  }

  const chapters = await selectBetaChapters(novelId);
  if (chapters.length === 0) {
    throw new ValidationError("Novel has no chapters", { code: "NOVEL_HAS_NO_CHAPTERS" });
  }

  for (const chapter of chapters) {
    if (typeof chapter.content !== "string" || chapter.content.length === 0) {
      throw new ValidationError(`Chapter ${chapter.index} has no content`, {
        code: "NOVEL_HAS_NO_CHAPTERS",
      });
    }
    if (chapter.content.length > env.betaMaxInputCharacters) {
      throw new ValidationError(
        `Chapter ${chapter.index} is too large for Beta (max ${env.betaMaxInputCharacters} characters)`,
        { code: "BETA_CHAPTER_TOO_LARGE", chapter_index: chapter.index },
      );
    }
  }

  const customPrompt = validateCustomPrompt(input.custom_prompt);
  const runId = randomUUID();
  const chapterIndexes = chapters.map((chapter) => chapter.index);
  // Hash the resolved prompt actually sent to the model, not just the raw input.
  const promptHash = hashContent(customPrompt || DEFAULT_CUSTOM_PROMPT);

  const runData = {
    id: runId,
    novel_id: novelId,
    status: "initializing" as BetaRunStatus,
    chapter_indexes: chapterIndexes,
    target_count: chapterIndexes.length,
    completed_count: 0,
    failed_count: 0,
    current_chapter_index: null,
    custom_prompt: customPrompt,
    prompt_template_version: env.betaPromptTemplateVersion,
    prompt_hash: promptHash,
    provider: "deepseek",
    model: env.deepSeekModel,
    requested_by: requestedBy,
    created_at: now,
    started_at: null,
    completed_at: null,
    published_by: null,
    published_at: null,
    cancelled_by: null,
    cancelled_at: null,
    error: null,
  };

  await db.runTransaction(async (transaction) => {
    const novelRef = db.collection("novels").doc(novelId);
    const freshNovel = await transaction.get(novelRef);
    const freshData = freshNovel.data();
    if (freshData?.active_beta_run_id) {
      throw new ConflictError("Novel already has an active beta run", {
        active_beta_run_id: freshData.active_beta_run_id,
      });
    }
    transaction.set(getRunRef(novelId, runId), runData);
    transaction.update(novelRef, {
      active_beta_run_id: runId,
      latest_beta_run_id: runId,
      beta_status: "initializing",
      beta_updated_at: now,
    });
  });

  // Snapshot source chapters and create pending beta chapters.
  const sourceWrites = [];
  for (const chapter of chapters) {
    sourceWrites.push({
      ref: getSourceChapterRef(novelId, runId, chapter.index),
      data: {
        index: chapter.index,
        title: chapter.title,
        content: chapter.content,
        word_count: chapter.word_count,
        source_hash: hashContent(chapter.content),
        source_updated_at: chapter.updated_at,
        created_at: now,
      },
    });
  }
  const betaWrites = chapters.map((chapter) => ({
    ref: getBetaChapterRef(novelId, runId, chapter.index),
    data: {
      index: chapter.index,
      title: chapter.title,
      content: null,
      word_count: null,
      status: "pending",
      source_hash: hashContent(chapter.content),
      attempt_count: 0,
      model: env.deepSeekModel,
      usage: null,
      processing_started_at: null,
      completed_at: null,
      published_at: null,
      error: null,
    },
  }));

  // Write source + beta chapter documents, then flip run to queued.
  const batch = db.batch();
  for (const write of sourceWrites) batch.set(write.ref, write.data);
  for (const write of betaWrites) batch.set(write.ref, write.data);
  batch.update(getRunRef(novelId, runId), { status: "queued" });
  try {
    await batch.commit();
  } catch (error) {
    // A Firestore batch is all-or-nothing, so no partial snapshots exist on failure.
    // Roll back so the novel is not left stuck in "initializing" with a phantom active run.
    await db.runTransaction(async (transaction) => {
      transaction.delete(getRunRef(novelId, runId));
      transaction.update(db.collection("novels").doc(novelId), {
        active_beta_run_id: admin.firestore.FieldValue.delete(),
        latest_beta_run_id: previousLatestRunId,
        beta_status: previousBetaStatus,
        beta_updated_at: previousBetaUpdatedAt,
      });
    });
    logger.error("Beta run initialization failed; rolled back", {
      novelId,
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logger.info("Beta run created", { novelId, runId, targetCount: chapterIndexes.length });

  return {
    id: runId,
    status: "queued",
    target_count: chapterIndexes.length,
    completed_count: 0,
    failed_count: 0,
    first_chapter_index: chapterIndexes[0],
  };
}

export async function getBetaRun(novelId: string, runId: string): Promise<BetaRunDocument> {
  const doc = await getRunRef(novelId, runId).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Beta run not found");
  return betaRunDocToData(doc.id, data);
}

export async function listBetaRuns(
  novelId: string,
  page: number,
  limit: number,
): Promise<PaginatedResult<BetaRunDocument>> {
  const db = getFirestore();
  const safeLimit = Math.min(limit || 20, 100);
  const collection = db.collection("novels").doc(novelId).collection("beta_runs");
  const totalCount = await collection.count().get();
  const total = totalCount.data().count;

  let query: admin.firestore.Query = collection.orderBy("created_at", "desc");
  if (page > 1) query = query.offset((page - 1) * safeLimit);
  const snapshot = await query.limit(safeLimit).get();
  const items = snapshot.docs
    .map((doc) => betaRunDocToData(doc.id, doc.data()))
    .filter((run) => run.id);
  return { items, page, limit: safeLimit, total };
}

export async function getBetaChapter(
  novelId: string,
  runId: string,
  chapterIndex: number,
): Promise<BetaChapterDocument> {
  const doc = await getBetaChapterRef(novelId, runId, chapterIndex).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Beta chapter not found");
  return betaChapterDocToData(data);
}

export interface BetaChapterSummary {
  index: number;
  title: string;
  status: BetaChapterDocument["status"];
  word_count: number | null;
  attempt_count: number;
  usage: BetaChapterDocument["usage"];
  error: BetaChapterDocument["error"];
  processing_started_at: string | null;
  completed_at: string | null;
  published_at: string | null;
  model: string;
}

export async function getBetaRunWithChapters(
  novelId: string,
  runId: string,
): Promise<{ run: BetaRunDocument; chapters: BetaChapterSummary[] }> {
  const db = getFirestore();
  const run = await getBetaRun(novelId, runId);
  const snapshot = await db
    .collection("novels")
    .doc(novelId)
    .collection("beta_runs")
    .doc(runId)
    .collection("beta_chapters")
    .orderBy("index", "asc")
    .select(
      "index",
      "title",
      "status",
      "word_count",
      "attempt_count",
      "usage",
      "error",
      "processing_started_at",
      "completed_at",
      "published_at",
      "model",
    )
    .get();

  const chapters: BetaChapterSummary[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      index: data.index,
      title: data.title,
      status: data.status,
      word_count: data.word_count ?? null,
      attempt_count: data.attempt_count ?? 0,
      usage: data.usage ?? null,
      error: data.error ?? null,
      processing_started_at: data.processing_started_at ?? null,
      completed_at: data.completed_at ?? null,
      published_at: data.published_at ?? null,
      model: data.model ?? "",
    };
  });
  return { run, chapters };
}

export async function getSourceChapter(
  novelId: string,
  runId: string,
  chapterIndex: number,
): Promise<BetaSourceChapterDocument> {
  const doc = await getSourceChapterRef(novelId, runId, chapterIndex).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("Source chapter not found");
  return sourceChapterDocToData(data);
}

export async function getBetaChapterComparison(
  novelId: string,
  runId: string,
  chapterIndex: number,
): Promise<BetaChapterComparison> {
  await getBetaRun(novelId, runId);
  const [source, beta] = await Promise.all([
    getSourceChapter(novelId, runId, chapterIndex),
    getBetaChapter(novelId, runId, chapterIndex),
  ]);
  return {
    source: {
      title: source.title,
      content: source.content,
      word_count: source.word_count,
    },
    beta: {
      content: beta.content,
      word_count: beta.word_count,
      status: beta.status,
      model: beta.model,
      attempt_count: beta.attempt_count,
      usage: beta.usage,
      error: beta.error,
    },
  };
}

export async function markBetaRunFailed(
  novelId: string,
  runId: string,
  error: BetaError,
): Promise<void> {
  const db = getFirestore();
  const run = await getBetaRun(novelId, runId);
  if (run.status === "failed" || run.status === "published") return;
  await db.runTransaction(async (transaction) => {
    transaction.update(getRunRef(novelId, runId), {
      status: "failed",
      completed_at: new Date().toISOString(),
      error,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      beta_status: "failed",
      active_beta_run_id: null,
      latest_beta_run_id: runId,
      beta_updated_at: new Date().toISOString(),
    });
  });
  logger.info("Beta run marked failed", { novelId, runId });
}

const CANCELLABLE_RUN_STATUSES: BetaRunStatus[] = [
  "initializing",
  "queued",
  "processing",
  "review_ready",
  "partial_failed",
];

export async function cancelBetaRun(
  novelId: string,
  runId: string,
  cancelledBy: string,
): Promise<{ run_id: string; status: "cancelled" }> {
  const db = getFirestore();
  const runRef = getRunRef(novelId, runId);
  const novelRef = db.collection("novels").doc(novelId);
  const unfinishedQuery = runRef
    .collection("beta_chapters")
    .where("status", "in", ["pending", "processing"]);
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const [runDoc, novelDoc, unfinished] = await Promise.all([
      transaction.get(runRef),
      transaction.get(novelRef),
      transaction.get(unfinishedQuery),
    ]);
    const runData = runDoc.data();
    if (!runDoc.exists || !runData) throw new NotFoundError("Beta run not found");

    const alreadyCancelled = runData.status === "cancelled";
    if (!alreadyCancelled && !CANCELLABLE_RUN_STATUSES.includes(runData.status as BetaRunStatus)) {
      throw new ConflictError("Only an active beta run can be cancelled", {
        status: runData.status,
      });
    }

    if (!alreadyCancelled) {
      transaction.update(runRef, {
        status: "cancelled",
        current_chapter_index: null,
        completed_at: now,
        cancelled_by: cancelledBy,
        cancelled_at: now,
        error: null,
      });

      const novelData = novelDoc.data();
      const runOwnsNovelState =
        novelData?.active_beta_run_id === runId ||
        novelData?.latest_beta_run_id === runId ||
        (!novelData?.active_beta_run_id && novelData?.beta_status === runData.status);
      if (runOwnsNovelState) {
        transaction.update(novelRef, {
          beta_status: "cancelled",
          active_beta_run_id: null,
          latest_beta_run_id: runId,
          beta_updated_at: now,
        });
      }
    }

    for (const chapter of unfinished.docs) {
      transaction.update(chapter.ref, {
        status: "cancelled",
        completed_at: now,
      });
    }
  });

  logger.info("Beta run cancelled", { novelId, runId, actorId: cancelledBy });
  return { run_id: runId, status: "cancelled" };
}

export async function retryBetaRun(
  novelId: string,
  runId: string,
  requestedBy: string,
  chapterIndexes?: number[],
): Promise<number[]> {
  const db = getFirestore();
  const run = await getBetaRun(novelId, runId);
  const novel = await getNovel(novelId);
  if (novel.active_beta_run_id && novel.active_beta_run_id !== runId) {
    throw new ConflictError("Novel already has another active beta run", {
      active_beta_run_id: novel.active_beta_run_id,
    });
  }

  const indexes =
    chapterIndexes && chapterIndexes.length > 0 ? chapterIndexes : run.chapter_indexes;
  const failedIndexes = new Set<number>();
  for (const index of indexes) {
    const chapter = await getBetaChapter(novelId, runId, index);
    if (chapter.status === "failed") failedIndexes.add(index);
  }
  if (failedIndexes.size === 0) {
    throw new ValidationError("No failed chapters to retry", { code: "BETA_INCOMPLETE" });
  }

  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    for (const index of failedIndexes) {
      transaction.update(getBetaChapterRef(novelId, runId, index), {
        status: "pending",
        error: null,
        processing_started_at: null,
        completed_at: null,
      });
    }
    transaction.update(getRunRef(novelId, runId), {
      status: "processing",
      current_chapter_index: null,
      error: null,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      active_beta_run_id: runId,
      latest_beta_run_id: runId,
      beta_status: "processing",
      beta_updated_at: now,
    });
  });

  logger.info("Beta run retry scheduled", {
    novelId,
    runId,
    actorId: requestedBy,
    failedIndexes: [...failedIndexes],
  });

  return [...failedIndexes];
}
