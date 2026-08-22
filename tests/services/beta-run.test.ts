import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  cancelBetaRun,
  createBetaRun,
  getBetaChapterComparison,
  retryBetaRun,
} from "../../src/services/beta-run.js";
import {
  mockBatchCommit,
  mockBatchSet,
  mockDocGet,
  mockQueryGet,
  mockTransactionDelete,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

const novelDoc = {
  id: "novel-1",
  slug: "tiem-hiep",
  title: "Tiên Hiệp",
  description: "",
  cover_url: "",
  status: "ongoing",
  publication_status: "public",
  chapter_count: 2,
  public_chapter_count: 2,
  total_word_count: 100,
  rating: 0,
  views: 0,
  followers: 0,
  comment_count: 0,
  price: null,
  is_featured: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  active_beta_run_id: null,
};

const chapter = (index: number) => ({
  index,
  title: `Chương ${index}`,
  content: `Nội dung chương ${index}`,
  word_count: 3,
  access_type: "free",
  price: 0,
  publication_status: "public",
  public_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("beta-run create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockBatchSet.mockReturnValue(undefined);
  });

  it("creates a run snapshotting the first chapters in order", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockQueryGet.mockResolvedValue({
      docs: [chapter(1), chapter(2)].map((data) => ({ data: () => data })),
      empty: false,
    });
    mockTransactionGet.mockResolvedValue({ exists: true, data: () => novelDoc });

    const result = await createBetaRun("novel-1", { custom_prompt: "" }, "user-1");

    expect(result.status).toBe("queued");
    expect(result.target_count).toBe(2);
    expect(result.first_chapter_index).toBe(1);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ latest_beta_run_id: result.id }),
    );
    // Source + beta chapter docs (2 each) + run status update.
    expect(mockBatchSet).toHaveBeenCalledTimes(4);
    expect(mockChapterHashWritten()).toBe(true);
  });

  it("rejects when the novel already has an active run", async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...novelDoc, active_beta_run_id: "run-other" }),
    });

    await expect(createBetaRun("novel-1", { custom_prompt: "" }, "user-1")).rejects.toThrow(
      "already has an active beta run",
    );
  });

  it("rejects a novel with no chapters", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    await expect(createBetaRun("novel-1", { custom_prompt: "" }, "user-1")).rejects.toThrow(
      "has no chapters",
    );
  });

  it("trims and stores the custom prompt", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockQueryGet.mockResolvedValue({
      docs: [chapter(1)].map((data) => ({ data: () => data })),
      empty: false,
    });
    mockTransactionGet.mockResolvedValue({ exists: true, data: () => novelDoc });

    const result = await createBetaRun("novel-1", { custom_prompt: "   Viết hay hơn  " }, "user-1");

    expect(result.id).toEqual(expect.any(String));
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ custom_prompt: "Viết hay hơn" }),
    );
  });

  it("hashes the resolved default prompt instead of an empty custom prompt", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockQueryGet.mockResolvedValue({
      docs: [chapter(1)].map((data) => ({ data: () => data })),
      empty: false,
    });
    mockTransactionGet.mockResolvedValue({ exists: true, data: () => novelDoc });

    await createBetaRun("novel-1", { custom_prompt: "   " }, "user-1");

    const runWrite = mockTransactionSet.mock.calls.find(
      (call: unknown[]) => (call[1] as { prompt_hash?: string })?.prompt_hash,
    );
    expect(runWrite).toBeDefined();
    const stored = (runWrite as unknown[])[1] as { prompt_hash: string };
    // Hash of default prompt must be stable and non-empty.
    expect(stored.prompt_hash).toEqual(expect.any(String));
    expect(stored.prompt_hash.length).toBe(64);
  });

  it("rolls back when the snapshot batch fails so the novel is not stuck in initializing", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockQueryGet.mockResolvedValue({
      docs: [chapter(1)].map((data) => ({ data: () => data })),
      empty: false,
    });
    mockTransactionGet.mockResolvedValue({ exists: true, data: () => novelDoc });
    mockBatchCommit.mockRejectedValue(new Error("batch failure"));
    mockTransactionDelete.mockResolvedValue(undefined);

    await expect(createBetaRun("novel-1", { custom_prompt: "" }, "user-1")).rejects.toThrow(
      "batch failure",
    );

    // The run document must be deleted and the novel reset to not_started.
    expect(mockTransactionDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) }),
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ beta_status: "not_started" }),
    );
  });
});

describe("beta-run comparison", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns source and beta chapter content", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...runDoc() }) })
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
          index: 1,
          title: "Chương 1",
          content: "Nội dung Beta",
          word_count: 4,
          status: "completed",
          source_hash: "abc",
          attempt_count: 1,
          model: "test-model",
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          processing_started_at: null,
          completed_at: "2026-01-01T00:00:00.000Z",
          published_at: null,
          error: null,
        }),
      });

    const result = await getBetaChapterComparison("novel-1", "run-1", 1);

    expect(result.source.content).toBe("Nội dung gốc");
    expect(result.beta.status).toBe("completed");
    expect(result.beta.usage?.total_tokens).toBe(3);
  });
});

describe("beta-run retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionUpdate.mockResolvedValue(undefined);
  });

  it("only retries chapters that failed", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => runDoc() })
      .mockResolvedValueOnce({ exists: true, data: () => novelDoc })
      // getBetaChapter calls for each requested index (1,2)
      .mockResolvedValueOnce({ exists: true, data: () => betaChapter(1, "failed") })
      .mockResolvedValueOnce({ exists: true, data: () => betaChapter(2, "completed") });

    const retried = await retryBetaRun("novel-1", "run-1", "user-1", [1, 2]);

    expect(retried).toEqual([1]);
  });
});

describe("beta-run cancel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });
  });

  it("cancels an active run and releases the novel", async () => {
    mockTransactionGet
      .mockResolvedValueOnce({ exists: true, data: () => runDoc("processing") })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...novelDoc, active_beta_run_id: "run-1" }),
      })
      .mockResolvedValueOnce({ docs: [], empty: true });

    const result = await cancelBetaRun("novel-1", "run-1", "user-1");

    expect(result).toEqual({ run_id: "run-1", status: "cancelled" });
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "cancelled", cancelled_by: "user-1" }),
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ beta_status: "cancelled", active_beta_run_id: null }),
    );
  });

  it("allows a review-ready run to be discarded", async () => {
    mockTransactionGet
      .mockResolvedValueOnce({ exists: true, data: () => runDoc("review_ready") })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          ...novelDoc,
          beta_status: "review_ready",
          active_beta_run_id: null,
          latest_beta_run_id: "run-1",
        }),
      })
      .mockResolvedValueOnce({ docs: [], empty: true });

    await expect(cancelBetaRun("novel-1", "run-1", "user-1")).resolves.toEqual({
      run_id: "run-1",
      status: "cancelled",
    });
  });
});

// --- helpers ---

function runDoc(status = "review_ready") {
  return {
    id: "run-1",
    novel_id: "novel-1",
    status,
    chapter_indexes: [1, 2],
    target_count: 2,
    completed_count: 2,
    failed_count: 0,
    current_chapter_index: null,
    custom_prompt: "",
    prompt_template_version: "v1",
    prompt_hash: "h",
    provider: "deepseek",
    model: "test-model",
    requested_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    started_at: null,
    completed_at: null,
    published_by: null,
    published_at: null,
    error: null,
  };
}

function betaChapter(index: number, status: string) {
  return {
    index,
    title: `Chương ${index}`,
    content: status === "failed" ? null : "beta content",
    word_count: status === "failed" ? null : 5,
    status,
    source_hash: "abc",
    attempt_count: 1,
    model: "test-model",
    usage: null,
    processing_started_at: null,
    completed_at: null,
    published_at: null,
    error: null,
  };
}

function mockChapterHashWritten(): boolean {
  const logged = mockBatchSet.mock.calls.some((call: unknown[]) => {
    const data = call[1] as { source_hash?: string };
    return typeof data?.source_hash === "string" && data.source_hash.length === 64;
  });
  return logged;
}
