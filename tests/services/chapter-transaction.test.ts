import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { deleteChapter, updateChapter } from "../../src/services/chapter.js";
import {
  mockTransactionDelete,
  mockTransactionGet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

const chapter = {
  index: 2,
  title: "Old title",
  content: "one two",
  word_count: 2,
  access_type: "free",
  price: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactionGet.mockResolvedValue({ exists: true, data: () => chapter });
  mockTransactionUpdate.mockResolvedValue(undefined);
  mockTransactionDelete.mockResolvedValue(undefined);
});

describe("chapter counter transactions", () => {
  it("updates the chapter and word counter in one transaction", async () => {
    const result = await updateChapter("novel-1", 2, { content: "one two three" });

    expect(result.word_count).toBe(3);
    expect(mockTransactionUpdate).toHaveBeenCalledTimes(2);
  });

  it("deletes the chapter and decrements counters in one transaction", async () => {
    await deleteChapter("novel-1", 2);

    expect(mockTransactionDelete).toHaveBeenCalledTimes(1);
    expect(mockTransactionUpdate).toHaveBeenCalledTimes(1);
  });
});
