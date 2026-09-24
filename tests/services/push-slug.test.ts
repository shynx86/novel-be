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

  it("updates description and keeps the uploaded novel as draft", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        slug: "truyen-cu",
        title: "Truyện cũ",
        description: "Mô tả cũ",
        publication_status: "public",
        author_ids: [],
        genre_ids: [],
      }),
    });
    mockDocSet.mockResolvedValue(undefined);

    const result = await upsertNovelMeta({
      slug: "truyen-cu",
      title: "Truyện cũ",
      description: "Mô tả mới",
      publication_status: "draft",
    });

    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Mô tả mới",
        publication_status: "draft",
      }),
      { merge: true },
    );
    expect(result.novel.description).toBe("Mô tả mới");
    expect(result.novel.publication_status).toBe("draft");
  });
});
