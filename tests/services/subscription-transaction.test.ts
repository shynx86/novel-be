import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { subscribeChapter } from "../../src/services/subscription.js";
import {
  mockDocGet,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

const publicNovel = {
  slug: "novel-1",
  title: "Test novel",
  publication_status: "public",
  price: 50,
};

const paidChapter = {
  index: 3,
  title: "Chapter 3",
  content: "Paid content",
  word_count: 2,
  access_type: "paid",
  price: 10,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const missingDoc = { exists: false, data: () => undefined };

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactionSet.mockResolvedValue(undefined);
  mockTransactionUpdate.mockResolvedValue(undefined);
});

describe("subscribeChapter transaction", () => {
  it("rechecks subscription records inside the transaction before deducting credits", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => publicNovel })
      .mockResolvedValueOnce({ exists: true, data: () => paidChapter })
      .mockResolvedValueOnce(missingDoc)
      .mockResolvedValueOnce(missingDoc);
    mockTransactionGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ credits: 100 }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ type: "novel" }) })
      .mockResolvedValueOnce(missingDoc);

    await expect(subscribeChapter("user-1", "novel-1", 3)).rejects.toThrow(
      "You have already subscribed to this novel",
    );

    expect(mockTransactionGet).toHaveBeenCalledTimes(3);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });
});
