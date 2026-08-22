import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publishBetaRun } from "../../src/services/beta-publisher.js";
import { hashContent } from "../../src/services/beta-run.js";
import {
  mockBatchCommit,
  mockBatchUpdate,
  mockDocGet,
  mockQueryGet,
} from "../__mocks__/firebase-admin.js";

const sourceContent = "Nội dung chương 1";
const betaContent = "Nội dung chương 1 đã biên tập hay hơn";
const sourceHash = hashContent(sourceContent);

function betaChapter(index: number) {
  return {
    index,
    title: `Chương ${index}`,
    content: betaContent,
    word_count: 6,
    status: "completed",
    source_hash: sourceHash,
    attempt_count: 1,
    model: "test-model",
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    processing_started_at: null,
    completed_at: "2026-01-01T00:00:00.000Z",
    published_at: null,
    error: null,
  };
}

function sourceChapter(index: number) {
  return {
    index,
    title: `Chương ${index}`,
    content: sourceContent,
    word_count: 4,
    source_hash: sourceHash,
    source_updated_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function canonicalChapter(index: number, content = sourceContent) {
  return {
    index,
    title: `Chương ${index}`,
    content,
    word_count: 4,
    access_type: "free",
    price: 0,
    publication_status: "public",
    public_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function runDoc(status = "review_ready") {
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
    started_at: null,
    completed_at: null,
    published_by: null,
    published_at: null,
    error: null,
  };
}

function seedPublishMocks() {
  mockDocGet
    .mockResolvedValueOnce({ exists: true, data: () => runDoc() })
    .mockResolvedValueOnce({ exists: true, data: () => sourceChapter(1) })
    .mockResolvedValueOnce({ exists: true, data: () => canonicalChapter(1) })
    .mockResolvedValueOnce({ exists: true, data: () => canonicalChapter(1) })
    .mockResolvedValueOnce({ exists: true, data: () => ({ total_word_count: 4 }) });
  mockQueryGet.mockResolvedValue({
    docs: [betaChapter(1)].map((data) => ({ data: () => data })),
    empty: false,
  });
}

describe("publishBetaRun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockBatchUpdate.mockResolvedValue(undefined);
  });

  it("publishes all chapters and updates word counts", async () => {
    seedPublishMocks();

    const result = await publishBetaRun("novel-1", "run-1", "user-1");

    expect(result.status).toBe("published");
    expect(result.published_chapter_indexes).toEqual([1]);
    expect(mockBatchUpdate).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("rejects when the run is not ready", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => runDoc("queued") });

    await expect(publishBetaRun("novel-1", "run-1", "user-1")).rejects.toThrow(
      "not ready to publish",
    );
  });

  it("rejects when a chapter changed after the snapshot", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => runDoc() })
      .mockResolvedValueOnce({ exists: true, data: () => sourceChapter(1) })
      // canonical content differs from the source snapshot
      .mockResolvedValueOnce({
        exists: true,
        data: () => canonicalChapter(1, "Nội dung đã bị sửa"),
      });
    mockQueryGet.mockResolvedValue({
      docs: [betaChapter(1)].map((data) => ({ data: () => data })),
      empty: false,
    });

    await expect(publishBetaRun("novel-1", "run-1", "user-1")).rejects.toThrow(
      "changed after the Beta was created",
    );
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("is idempotent when already published", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => runDoc("published") });

    const result = await publishBetaRun("novel-1", "run-1", "user-1");

    expect(result.status).toBe("published");
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
