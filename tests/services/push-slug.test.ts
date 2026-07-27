import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { upsertNovelMeta } from "../../src/services/push.js";
import { mockDocGet, mockDocSet } from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("push novel slug handling", () => {
  it("normalizes a Vietnamese slug and uses it as the novel ID", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    mockDocSet.mockResolvedValue(undefined);

    const result = await upsertNovelMeta({
      slug: "Đấu Phá Thương Khung",
      title: "Đấu Phá Thương Khung",
    });

    expect(result.novel.id).toBe("dau-pha-thuong-khung");
    expect(result.novel.slug).toBe("dau-pha-thuong-khung");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "dau-pha-thuong-khung" }),
      { merge: true },
    );
  });
});
