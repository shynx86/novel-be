import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { listPublicNovels } from "../../src/services/novel.js";
import { mockCountGet, mockGetAll, mockQueryGet } from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listPublicNovels", () => {
  it("uses paged public-novel results and batches relation enrichment", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockQueryGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "novel-1",
            data: () => ({
              title: "First Novel",
              publication_status: "public",
              status: "ongoing",
              created_at: "2026-07-19T00:00:00.000Z",
            }),
          },
          {
            id: "novel-2",
            data: () => ({
              title: "Second Novel",
              publication_status: "public",
              status: "ongoing",
              translator_id: "translator-1",
              created_at: "2026-07-18T00:00:00.000Z",
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ novel_id: "novel-1", author_id: "author-1" }) },
          { data: () => ({ novel_id: "novel-2", author_id: "author-2" }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ novel_id: "novel-1", genre_id: "genre-1" }) },
          { data: () => ({ novel_id: "novel-2", genre_id: "genre-2" }) },
        ],
      });
    mockGetAll
      .mockResolvedValueOnce([
        { exists: true, id: "author-1", data: () => ({ name: "Author One" }) },
        { exists: true, id: "author-2", data: () => ({ name: "Author Two" }) },
      ])
      .mockResolvedValueOnce([
        { exists: true, id: "genre-1", data: () => ({ name: "Fantasy" }) },
        { exists: true, id: "genre-2", data: () => ({ name: "Action" }) },
      ])
      .mockResolvedValueOnce([
        { exists: true, id: "translator-1", data: () => ({ display_name: "Translator" }) },
      ]);

    const result = await listPublicNovels({ page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({ authors: [{ id: "author-1", name: "Author One" }] }),
      expect.objectContaining({
        genres: [{ id: "genre-2", name: "Action" }],
        translator: { id: "translator-1", name: "Translator" },
      }),
    ]);
    expect(mockQueryGet).toHaveBeenCalledTimes(3);
    expect(mockGetAll).toHaveBeenCalledTimes(3);
  });
});
