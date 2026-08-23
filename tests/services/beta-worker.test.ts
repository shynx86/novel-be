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

  it("uses the model pinned to the run when calling the AI provider", async () => {
    const selectedModel = "openai/gpt-5.6-luna";
    const initialRun = { ...runDoc(), model: selectedModel, completed_count: 0 };
    const completedRun = { ...initialRun, completed_count: 1 };

    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => initialRun })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          index: 1,
          title: "Chương 1",
          content: null,
          word_count: null,
          status: "pending",
          source_hash: "abc",
          attempt_count: 0,
          model: selectedModel,
          usage: null,
          processing_started_at: null,
          completed_at: null,
          published_at: null,
          error: null,
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          index: 1,
          title: "Chương 1",
          content: "Nội dung gốc",
          word_count: 3,
          source_hash: "abc",
          source_updated_at: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: "novel-1",
          slug: "novel-1",
          title: "Novel 1",
          chapter_count: 1,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => completedRun });

    mockTransactionGet
      .mockResolvedValueOnce({ exists: true, data: () => initialRun })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ status: "pending", attempt_count: 0 }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => initialRun })
      .mockResolvedValueOnce({ exists: true, data: () => completedRun });

    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Nội dung Beta" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { status: 200 },
      ),
    );

    await processBetaChapterTask({ novelId: "novel-1", runId: "run-1", chapterIndex: 1 });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: selectedModel });
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed", model: selectedModel }),
    );
  });
});
