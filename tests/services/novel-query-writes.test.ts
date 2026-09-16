import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publicFilterKey } from "../../src/services/novel-list-index.js";
import { updateNovel } from "../../src/services/novel.js";
import { mockDocGet, mockDocUpdate } from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("novel query fields", () => {
  it("indexes a draft title and its existing genres when published", async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      id: "novel-1",
      data: () => ({
        title: "Quest of Stars",
        status: "ongoing",
        publication_status: "draft",
        author_ids: [],
        genre_ids: ["fantasy"],
      }),
    });

    await updateNovel("novel-1", { publication_status: "public" });

    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title_grams: expect.arrayContaining(["que", "est"]),
        public_filter_keys: expect.arrayContaining([publicFilterKey({ genreId: "fantasy" })]),
      }),
    );
  });
});
