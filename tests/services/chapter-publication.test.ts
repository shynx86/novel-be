import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publishDueChapters } from "../../src/services/chapter-publication.js";
import {
  mockQueryGet,
  mockTransactionGet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("publishDueChapters", () => {
  it("publishes a due chapter and increments its novel counter once", async () => {
    const novelRef = { id: "novel-1" };
    const chapterRef = { id: "2", parent: { parent: novelRef } };
    mockQueryGet.mockResolvedValue({ docs: [{ ref: chapterRef }] });
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({
        publication_status: "scheduled",
        public_at: "2026-08-16T09:00:00.000Z",
      }),
    });

    const count = await publishDueChapters(new Date("2026-08-16T10:00:00.000Z"));

    expect(count).toBe(1);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      chapterRef,
      expect.objectContaining({ publication_status: "public" }),
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      novelRef,
      expect.objectContaining({ public_chapter_count: { _increment: 1 } }),
    );
  });

  it("skips a chapter that another worker already published", async () => {
    const novelRef = { id: "novel-1" };
    const chapterRef = { id: "2", parent: { parent: novelRef } };
    mockQueryGet.mockResolvedValue({ docs: [{ ref: chapterRef }] });
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({
        publication_status: "public",
        public_at: "2026-08-16T09:00:00.000Z",
      }),
    });

    expect(await publishDueChapters(new Date("2026-08-16T10:00:00.000Z"))).toBe(0);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });
});
