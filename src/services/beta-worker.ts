import { env } from "../config/env.js";
import type { BetaChapterStatus, BetaError, BetaRunDocument } from "../types/beta.js";
import { logger } from "../utils/logger.js";
import { DeepSeekError, isRetryableDeepSeekError, rewriteChapter } from "./ai/deepseek-client.js";
import {
  countWords,
  getBetaChapter,
  getBetaChapterRef,
  getBetaRun,
  getRunRef,
  getSourceChapter,
} from "./beta-run.js";
import { enqueueBetaChapterTask } from "./beta-task-dispatcher.js";
import { getFirestore } from "./firebase.js";
import { getNovel } from "./novel.js";

export interface BetaChapterTaskPayload {
  novelId: string;
  runId: string;
  chapterIndex: number;
}

export interface BetaTaskExecutionContext {
  retryCount?: number;
  maxAttempts?: number;
}

const PREVIOUS_EXCERPT_CHARACTERS = 2000;

function toBetaError(error: DeepSeekError): BetaError {
  switch (error.type) {
    case "timeout":
      return { type: "provider_timeout", code: "BETA_PROVIDER_TIMEOUT", message: error.message };
    case "rate_limited":
      return {
        type: "provider_rate_limited",
        code: "BETA_PROVIDER_RATE_LIMITED",
        message: error.message,
      };
    case "invalid_response":
      return { type: "invalid_response", code: "BETA_INVALID_RESPONSE", message: error.message };
    default:
      return {
        type: "provider",
        code: "BETA_PROVIDER_ERROR",
        message: error.message,
        details: error.statusCode ?? undefined,
      };
  }
}

async function loadPreviousExcerpt(
  novelId: string,
  runId: string,
  run: BetaRunDocument,
  currentIndex: number,
): Promise<string | undefined> {
  const previousIndexes = run.chapter_indexes.filter((index) => index < currentIndex);
  if (previousIndexes.length === 0) return undefined;
  const previousIndex = previousIndexes[previousIndexes.length - 1];
  try {
    const previous = await getBetaChapter(novelId, runId, previousIndex);
    if (previous.status === "completed" && previous.content) {
      return previous.content.slice(-PREVIOUS_EXCERPT_CHARACTERS);
    }
  } catch {
    // Previous chapter may not have a beta result yet; continue without context.
  }
  return undefined;
}

async function finalizeRun(
  novelId: string,
  runId: string,
  status: BetaRunDocument["status"],
): Promise<void> {
  const db = getFirestore();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const runDoc = await transaction.get(getRunRef(novelId, runId));
    if (runDoc.data()?.status === "cancelled") return;
    transaction.update(getRunRef(novelId, runId), {
      status,
      completed_at: now,
      current_chapter_index: null,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      beta_status: status,
      active_beta_run_id: null,
      latest_beta_run_id: runId,
      beta_updated_at: now,
    });
  });
  logger.info("Beta run finalized", { novelId, runId, status });
}

async function maybeFinalizeOrContinue(
  novelId: string,
  runId: string,
  _completedChapterIndex: number,
): Promise<void> {
  const db = getFirestore();
  const run = await getBetaRun(novelId, runId);
  if (["cancelled", "failed", "published"].includes(run.status)) return;
  const allProcessed = run.completed_count + run.failed_count >= run.target_count;

  if (allProcessed) {
    if (run.failed_count > 0) {
      const status = run.completed_count === 0 ? "failed" : "partial_failed";
      await finalizeRun(novelId, runId, status);
      return;
    }
    await finalizeRun(novelId, runId, "review_ready");
    return;
  }

  // Continue with the next pending chapter (single-field equality query needs no composite index).
  const snapshot = await db
    .collection("novels")
    .doc(novelId)
    .collection("beta_runs")
    .doc(runId)
    .collection("beta_chapters")
    .where("status", "==", "pending")
    .select("index")
    .get();

  if (snapshot.empty) return;
  const nextIndex = Math.min(...snapshot.docs.map((doc) => Number(doc.data().index ?? 0)));
  await enqueueBetaChapterTask({ novelId, runId, chapterIndex: nextIndex });
}

async function claimChapter(
  novelId: string,
  runId: string,
  chapterIndex: number,
): Promise<BetaChapterStatus | null> {
  const db = getFirestore();
  const now = new Date().toISOString();

  let previousStatus: BetaChapterStatus = "pending";
  let claimed = false;
  await db.runTransaction(async (transaction) => {
    const runRef = getRunRef(novelId, runId);
    const chapterRef = getBetaChapterRef(novelId, runId, chapterIndex);
    const [runDoc, chapterDoc] = await Promise.all([
      transaction.get(runRef),
      transaction.get(chapterRef),
    ]);
    const runData = runDoc.data();
    if (!runDoc.exists || !runData) throw new Error("Beta run not found");
    if (!["initializing", "queued", "processing"].includes(runData.status)) return;
    const data = chapterDoc.data();
    if (!chapterDoc.exists || !data) throw new Error("Beta chapter not found");
    previousStatus = data.status as BetaChapterStatus;
    if (
      previousStatus === "cancelled" ||
      previousStatus === "completed" ||
      previousStatus === "published"
    ) {
      return;
    }
    claimed = true;
    transaction.update(chapterRef, {
      status: "processing",
      attempt_count: (data.attempt_count ?? 0) + 1,
      processing_started_at: now,
      error: null,
    });
    transaction.update(runRef, {
      status: "processing",
      current_chapter_index: chapterIndex,
      started_at: runData.started_at ?? now,
      error: null,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      active_beta_run_id: runId,
      beta_status: "processing",
      beta_updated_at: now,
    });
  });
  return claimed ? previousStatus : null;
}

async function completeChapter(
  novelId: string,
  runId: string,
  chapterIndex: number,
  result: {
    content: string;
    model: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  },
  previousStatus: BetaChapterStatus,
): Promise<boolean> {
  const db = getFirestore();
  const now = new Date().toISOString();
  let completed = false;
  await db.runTransaction(async (transaction) => {
    const runDoc = await transaction.get(getRunRef(novelId, runId));
    const runData = runDoc.data();
    if (runData?.status === "cancelled") return;
    completed = true;
    const completedCount = runData?.completed_count ?? 0;
    const failedCount = runData?.failed_count ?? 0;
    const wasCompleted = previousStatus === "completed" || previousStatus === "published";
    const wasFailed = previousStatus === "failed";

    const nextCompleted = wasCompleted ? completedCount : completedCount + 1;
    const nextFailed = wasFailed ? Math.max(0, failedCount - 1) : failedCount;

    transaction.update(getBetaChapterRef(novelId, runId, chapterIndex), {
      content: result.content,
      word_count: countWords(result.content),
      status: "completed",
      model: result.model,
      completed_at: now,
      usage: {
        prompt_tokens: result.usage.promptTokens,
        completion_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      },
      error: null,
    });
    transaction.update(getRunRef(novelId, runId), {
      completed_count: nextCompleted,
      failed_count: nextFailed,
      current_chapter_index: chapterIndex,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      beta_completed_count: nextCompleted,
      beta_failed_count: nextFailed,
      beta_status: "processing",
      beta_updated_at: now,
    });
  });
  return completed;
}

async function failChapter(
  novelId: string,
  runId: string,
  chapterIndex: number,
  error: BetaError,
  previousStatus: BetaChapterStatus,
): Promise<boolean> {
  const db = getFirestore();
  const now = new Date().toISOString();
  let failed = false;
  await db.runTransaction(async (transaction) => {
    const runDoc = await transaction.get(getRunRef(novelId, runId));
    const runData = runDoc.data();
    if (runData?.status === "cancelled") return;
    failed = true;
    const failedCount = runData?.failed_count ?? 0;
    const wasFailed = previousStatus === "failed";
    const nextFailed = wasFailed ? failedCount : failedCount + 1;

    transaction.update(getBetaChapterRef(novelId, runId, chapterIndex), {
      status: "failed",
      error,
      completed_at: now,
    });
    transaction.update(getRunRef(novelId, runId), {
      failed_count: nextFailed,
      current_chapter_index: chapterIndex,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      beta_failed_count: nextFailed,
      beta_updated_at: now,
    });
  });
  return failed;
}

async function markChapterRetrying(
  novelId: string,
  runId: string,
  chapterIndex: number,
  error: BetaError,
): Promise<boolean> {
  const db = getFirestore();
  const now = new Date().toISOString();
  let retrying = false;
  await db.runTransaction(async (transaction) => {
    const runDoc = await transaction.get(getRunRef(novelId, runId));
    if (runDoc.data()?.status === "cancelled") return;
    retrying = true;
    transaction.update(getBetaChapterRef(novelId, runId, chapterIndex), {
      status: "retrying",
      error,
      completed_at: null,
    });
    transaction.update(getRunRef(novelId, runId), {
      status: "processing",
      current_chapter_index: chapterIndex,
      error,
    });
    transaction.update(db.collection("novels").doc(novelId), {
      beta_status: "processing",
      beta_updated_at: now,
    });
  });
  return retrying;
}

export async function processBetaChapterTask(
  payload: BetaChapterTaskPayload,
  context: BetaTaskExecutionContext = {},
): Promise<void> {
  const { novelId, runId, chapterIndex } = payload;
  const startedAt = Date.now();

  const run = await getBetaRun(novelId, runId);
  if (run.status === "published" || run.status === "failed" || run.status === "cancelled") return;

  const betaChapter = await getBetaChapter(novelId, runId, chapterIndex);
  if (betaChapter.status === "completed" || betaChapter.status === "published") {
    // Idempotency: never call the AI twice for an already-completed chapter.
    await maybeFinalizeOrContinue(novelId, runId, chapterIndex);
    return;
  }

  const previousStatus = await claimChapter(novelId, runId, chapterIndex);
  if (previousStatus === null) return;
  if (previousStatus === "completed" || previousStatus === "published") {
    // Another invocation finished this chapter before we claimed it.
    await maybeFinalizeOrContinue(novelId, runId, chapterIndex);
    return;
  }

  try {
    const [source, novel] = await Promise.all([
      getSourceChapter(novelId, runId, chapterIndex),
      getNovel(novelId),
    ]);
    const previousExcerpt = await loadPreviousExcerpt(novelId, runId, run, chapterIndex);
    const result = await rewriteChapter(
      {
        novelTitle: novel.title,
        chapterIndex,
        chapterTitle: source.title,
        sourceContent: source.content,
        customPrompt: run.custom_prompt,
        previousChapterExcerpt: previousExcerpt,
      },
      { model: run.model },
    );
    const completed = await completeChapter(novelId, runId, chapterIndex, result, previousStatus);
    if (!completed) return;
    logger.info("Beta chapter completed", {
      novelId,
      runId,
      chapterIndex,
      model: result.model,
      attempt: betaChapter.attempt_count + 1,
      durationMs: Date.now() - startedAt,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      status: "completed",
    });
  } catch (error) {
    if (error instanceof DeepSeekError && isRetryableDeepSeekError(error)) {
      const retryCount = context.retryCount ?? 0;
      const maxAttempts = context.maxAttempts ?? env.betaTaskMaxAttempts;
      const betaError = toBetaError(error);
      if (retryCount + 1 < maxAttempts) {
        const retrying = await markChapterRetrying(novelId, runId, chapterIndex, betaError);
        if (!retrying) return;
        logger.warn("Beta chapter scheduled for retry", {
          novelId,
          runId,
          chapterIndex,
          attempt: betaChapter.attempt_count + 1,
          retryCount,
          maxAttempts,
          durationMs: Date.now() - startedAt,
          type: error.type,
        });
        throw error;
      }
    }
    const betaError =
      error instanceof DeepSeekError
        ? toBetaError(error)
        : {
            type: "internal" as const,
            code: "BETA_PROVIDER_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          };
    const failed = await failChapter(novelId, runId, chapterIndex, betaError, previousStatus);
    if (!failed) return;
    logger.info("Beta chapter failed", {
      novelId,
      runId,
      chapterIndex,
      attempt: betaChapter.attempt_count + 1,
      durationMs: Date.now() - startedAt,
      code: betaError.code,
      status: "failed",
    });
  }

  await maybeFinalizeOrContinue(novelId, runId, chapterIndex);
}
