import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publicFilterKey } from "../../src/services/novel-list-index.js";
import { listNovelsForSitemap, listPublicNovels } from "../../src/services/novel.js";
import {
  mockCountGet,
  mockGetAll,
  mockQueryGet,
  mockQueryLimit,
  mockQueryOffset,
  mockQueryOrderBy,
  mockQuerySelect,
  mockQueryWhere,
} from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listPublicNovels", () => {
  it("uses paged public-novel results and batches relation enrichment", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockQueryGet.mockResolvedValueOnce({
      docs: [
        {
          id: "novel-1",
          data: () => ({
            title: "First Novel",
            publication_status: "public",
            status: "ongoing",
            author_ids: ["author-1"],
            genre_ids: ["genre-1"],
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
            author_ids: ["author-2"],
            genre_ids: ["genre-2"],
            created_at: "2026-07-18T00:00:00.000Z",
          }),
        },
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
        translator: {
          id: "translator-1",
          name: "Translator",
          username: "user_translator-1",
        },
      }),
    ]);
    expect(mockQueryGet).toHaveBeenCalledTimes(1);
    expect(mockGetAll).toHaveBeenCalledTimes(3);
  });

  it("pages a translator portfolio using the public filter index", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 21 }) });
    mockQueryGet.mockResolvedValueOnce({
      docs: [
        {
          id: "public-novel",
          data: () => ({
            slug: "public-novel",
            title: "Public Novel",
            publication_status: "public",
            status: "ongoing",
            translator_id: "translator-1",
            author_ids: [],
            genre_ids: [],
            created_at: "2026-08-01T00:00:00.000Z",
          }),
        },
      ],
    });
    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        id: "translator-1",
        data: () => ({ display_name: "Translator", username: "translator" }),
      },
    ]);

    const result = await listPublicNovels({
      translator_id: "translator-1",
      page: 2,
      limit: 12,
    });

    expect(result.total).toBe(21);
    expect(result.items[0]).toMatchObject({
      id: "public-novel",
      translator: { username: "translator" },
    });
    expect(mockQueryWhere).toHaveBeenCalledWith(
      "public_filter_keys",
      "array-contains",
      publicFilterKey({ translatorId: "translator-1" }),
    );
    expect(mockQueryOrderBy).toHaveBeenCalledWith("created_at", "desc");
    expect(mockQueryOffset).toHaveBeenCalledWith(12);
    expect(mockQueryLimit).toHaveBeenCalledWith(12);
    expect(mockQueryGet).toHaveBeenCalledTimes(1);
  });

  it("queries a filtered page before loading novel relations", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1000 }) });
    mockQueryGet.mockResolvedValue({ docs: [] });

    const result = await listPublicNovels({
      genre_id: "fantasy",
      status: "completed",
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1000);
    expect(mockQueryWhere).toHaveBeenCalledWith(
      "public_filter_keys",
      "array-contains",
      publicFilterKey({ genreId: "fantasy", status: "completed" }),
    );
    expect(mockQueryGet).toHaveBeenCalledTimes(1);
    expect(mockGetAll).not.toHaveBeenCalled();
  });
});

describe("listNovelsForSitemap", () => {
  it("excludes drafts and keeps legacy public novels with the projected fields", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        {
          id: "public-novel",
          data: () => ({
            slug: "public-novel",
            publication_status: "public",
            public_chapter_count: 2,
            updated_at: "2026-08-01T00:00:00.000Z",
          }),
        },
        {
          id: "draft-novel",
          data: () => ({ slug: "draft-novel", publication_status: "draft" }),
        },
        {
          id: "legacy-novel",
          data: () => ({ chapter_count: 3, updated_at: "2026-07-01T00:00:00.000Z" }),
        },
      ],
    });

    expect(await listNovelsForSitemap()).toEqual([
      {
        id: "public-novel",
        slug: "public-novel",
        chapter_count: 2,
        updated_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "legacy-novel",
        slug: "legacy-novel",
        chapter_count: 3,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ]);
    expect(mockQuerySelect).toHaveBeenCalledWith(
      "slug",
      "chapter_count",
      "public_chapter_count",
      "updated_at",
      "publication_status",
    );
  });
});
