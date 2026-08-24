import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { BetaChapterTaskPayload } from "./beta-worker.js";

let cloudTasksEnabled: boolean | null = null;

function isCloudTasksEnabled(): boolean {
  if (cloudTasksEnabled === null) {
    cloudTasksEnabled =
      process.env.NODE_ENV !== "test" &&
      (Boolean(process.env.K_SERVICE) ||
        Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
        Boolean(process.env.FUNCTIONS_EMULATOR));
  }
  return cloudTasksEnabled;
}

export async function enqueueBetaChapterTask(payload: BetaChapterTaskPayload): Promise<void> {
  if (isCloudTasksEnabled()) {
    try {
      const { getFunctions } = await import("firebase-admin/functions");
      const { getAdminApp } = await import("./firebase.js");
      const queue = getFunctions(getAdminApp()).taskQueue("processBetaChapter");
      await queue.enqueue(payload);
      return;
    } catch (error) {
      logger.warn("Cloud Tasks enqueue failed; falling back to inline processing", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Standalone / emulator fallback: process the chapter inline.
  scheduleInlineBetaChapterTask(payload, 0);
}

function scheduleInlineBetaChapterTask(payload: BetaChapterTaskPayload, retryCount: number): void {
  const delayMs = retryCount === 0 ? 0 : Math.min(1000 * 2 ** (retryCount - 1), 30_000);
  const timer = setTimeout(async () => {
    const { processBetaChapterTask } = await import("./beta-worker.js");
    try {
      await processBetaChapterTask(payload, {
        retryCount,
        maxAttempts: env.betaTaskMaxAttempts,
      });
    } catch (error) {
      const nextRetryCount = retryCount + 1;
      if (nextRetryCount < env.betaTaskMaxAttempts) {
        logger.warn("Inline beta chapter will retry", {
          ...payload,
          retryCount: nextRetryCount,
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleInlineBetaChapterTask(payload, nextRetryCount);
        return;
      }
      logger.error("Inline beta chapter processing exhausted retries", {
        ...payload,
        retryCount: nextRetryCount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, delayMs);
  timer.unref?.();
}
