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
  const { processBetaChapterTask } = await import("./beta-worker.js");
  setImmediate(() => {
    processBetaChapterTask(payload).catch((error) => {
      logger.error("Inline beta chapter processing failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
