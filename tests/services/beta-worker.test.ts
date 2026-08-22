import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { processBetaChapterTask } from "../../src/services/beta-worker.js";
import {
  mockDocGet,
  mockRunTransaction,
  mockTransactionGet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

function runDoc(status = "processing") {
  return {
    id: "run-1",
    novel_id: "novel-1",
    status,
    chapter_indexes: [1],
    target_count: 1,
    completed_count: 1,
    failed_count: 0,
    current_chapter_index: null,
    custom_prompt: "",
    prompt_template_version: "v1",
    prompt_hash: "h",
    provider: "deepseek",
    model: "test-model",
    requested_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    published_by: null,
    published_at: null,
    error: null,
  };
}

describe("processBetaChapterTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionGet.mockResolvedValue({ exists: false, data: () => undefined });
    mockTransactionUpdate.mockResolvedValue(undefined);
    // Fail loudly if the worker ever tries to reach DeepSeek in a unit test.
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected AI call"));
  });

  it("does not call the AI again for an already completed chapter and finalizes the run", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => runDoc() }) // getBetaRun
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          index: 1,
          title: "Chương 1",
          content: "beta done",
          word_count: 5,
          status: "completed",
          source_hash: "abc",
          attempt_count: 1,
          model: "test-model",
          usage: null,
          processing_started_at: null,
          completed_at: "2026-01-01T00:00:00.000Z",
          published_at: null,
          error: null,
        }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => runDoc() }); // getBetaRun inside finalize

    await processBetaChapterTask({ novelId: "novel-1", runId: "run-1", chapterIndex: 1 });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Finalize run -> two transaction updates (run + novel).
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "review_ready" }),
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ latest_beta_run_id: "run-1" }),
    );
  });

  it("marks the run failed when it is already failed", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => runDoc("failed") });

    await processBetaChapterTask({ novelId: "novel-1", runId: "run-1", chapterIndex: 1 });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it("does not process a cancelled run", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => runDoc("cancelled") });

    await processBetaChapterTask({ novelId: "novel-1", runId: "run-1", chapterIndex: 1 });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });
});
