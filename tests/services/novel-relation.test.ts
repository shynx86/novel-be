import { jest } from "@jest/globals";
import { publicFilterKey } from "../../src/services/novel-list-index.js";
import {
  mockCountGet,
  mockGetAll,
  mockQueryGet,
  mockTransactionDelete,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionUpdate,
} from "../__mocks__/firebase-admin.js";

// Must import after mocks are set up
const {
  setNovelAuthors,
  setNovelGenres,
  getNovelAuthors,
  getNovelGenres,
  getNovelsByAuthor,
  getNovelsByGenre,
} = await import("../../src/services/novel-relation.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactionGet.mockReset();
  mockTransactionGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({
      publication_status: "public",
      status: "ongoing",
      author_ids: [],
      genre_ids: [],
    }),
  });
});

// ─── setNovelAuthors ────────────────────────────────────────────────────────

describe("setNovelAuthors", () => {
  it("creates junction docs for new author ids", async () => {
    // Existing relations query → empty
    mockTransactionGet.mockResolvedValueOnce({ docs: [], empty: true });

    await setNovelAuthors("novel-1", ["author-1", "author-2"]);

    expect(mockTransactionSet).toHaveBeenCalledTimes(2);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ author_ids: ["author-1", "author-2"] }),
    );
    expect(mockTransactionDelete).not.toHaveBeenCalled();
  });

  it("removes relations for author ids not in new list", async () => {
    // Existing relations: author-1, author-2
    mockTransactionGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } },
        { data: () => ({ author_id: "author-2" }), ref: { id: "novel-1:author-2" } },
      ],
      empty: false,
    });
    // Replace with only author-1
    await setNovelAuthors("novel-1", ["author-1"]);

    expect(mockTransactionDelete).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it("does nothing when new list matches existing", async () => {
    mockTransactionGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } }],
      empty: false,
    });
    await setNovelAuthors("novel-1", ["author-1"]);

    expect(mockTransactionDelete).not.toHaveBeenCalled();
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it("clears all relations when empty array provided", async () => {
    mockTransactionGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } }],
      empty: false,
    });
    await setNovelAuthors("novel-1", []);

    expect(mockTransactionDelete).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it("preserves legacy genre ids while adding the denormalized relation arrays", async () => {
    mockTransactionGet.mockReset();
    mockTransactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ publication_status: "public", status: "ongoing" }),
    });
    mockTransactionGet.mockResolvedValueOnce({ docs: [], empty: true }).mockResolvedValueOnce({
      docs: [{ data: () => ({ genre_id: "genre-1" }) }],
      empty: false,
    });
    await setNovelAuthors("novel-1", ["author-1"]);

    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ author_ids: ["author-1"], genre_ids: ["genre-1"] }),
    );
  });
});

// ─── setNovelGenres ─────────────────────────────────────────────────────────

describe("setNovelGenres", () => {
  it("creates junction docs for new genre ids", async () => {
    mockTransactionGet.mockResolvedValueOnce({ docs: [], empty: true });

    await setNovelGenres("novel-1", ["genre-1", "genre-2", "genre-3"]);

    expect(mockTransactionSet).toHaveBeenCalledTimes(3);
  });

  it("replaces all relations when list changes", async () => {
    mockTransactionGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ genre_id: "genre-1" }), ref: { id: "novel-1:genre-1" } },
        { data: () => ({ genre_id: "genre-2" }), ref: { id: "novel-1:genre-2" } },
      ],
      empty: false,
    });
    await setNovelGenres("novel-1", ["genre-2", "genre-3"]);

    // genre-1 removed, genre-3 added, genre-2 unchanged
    expect(mockTransactionDelete).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).toHaveBeenCalledTimes(1);
  });

  it("indexes combined author and genre filters with the relation update", async () => {
    mockTransactionGet.mockReset();
    mockTransactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        publication_status: "public",
        status: "ongoing",
        author_ids: ["author-1"],
        genre_ids: [],
      }),
    });
    mockTransactionGet.mockResolvedValueOnce({ docs: [], empty: true });

    await setNovelGenres("novel-1", ["genre-1"]);

    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        public_filter_keys: expect.arrayContaining([
          publicFilterKey({ authorId: "author-1", genreId: "genre-1" }),
        ]),
      }),
    );
  });
});

// ─── getNovelAuthors ────────────────────────────────────────────────────────

describe("getNovelAuthors", () => {
  it("returns author ids and names", async () => {
    // Junction query
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ author_id: "author-1" }) },
        { data: () => ({ author_id: "author-2" }) },
      ],
      empty: false,
    });
    // Batch fetch authors
    mockGetAll.mockResolvedValue([
      { exists: true, id: "author-1", data: () => ({ name: "Author One" }) },
      { exists: true, id: "author-2", data: () => ({ name: "Author Two" }) },
    ]);

    const result = await getNovelAuthors("novel-1");

    expect(result).toEqual([
      { author_id: "author-1", author_name: "Author One" },
      { author_id: "author-2", author_name: "Author Two" },
    ]);
  });

  it("returns empty array when no relations", async () => {
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const result = await getNovelAuthors("novel-1");

    expect(result).toEqual([]);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("filters out non-existent authors", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ author_id: "author-1" }) },
        { data: () => ({ author_id: "author-deleted" }) },
      ],
      empty: false,
    });
    mockGetAll.mockResolvedValue([
      { exists: true, id: "author-1", data: () => ({ name: "Author One" }) },
      { exists: false, id: "author-deleted" },
    ]);

    const result = await getNovelAuthors("novel-1");

    expect(result).toEqual([{ author_id: "author-1", author_name: "Author One" }]);
  });
});

// ─── getNovelGenres ─────────────────────────────────────────────────────────

describe("getNovelGenres", () => {
  it("returns genre ids and names", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ genre_id: "genre-1" }) }, { data: () => ({ genre_id: "genre-2" }) }],
      empty: false,
    });
    mockGetAll.mockResolvedValue([
      { exists: true, id: "genre-1", data: () => ({ name: "Fantasy" }) },
      { exists: true, id: "genre-2", data: () => ({ name: "Action" }) },
    ]);

    const result = await getNovelGenres("novel-1");

    expect(result).toEqual([
      { genre_id: "genre-1", genre_name: "Fantasy" },
      { genre_id: "genre-2", genre_name: "Action" },
    ]);
  });

  it("returns empty array when no relations", async () => {
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const result = await getNovelGenres("novel-1");

    expect(result).toEqual([]);
  });
});

// ─── getNovelsByAuthor ──────────────────────────────────────────────────────

describe("getNovelsByAuthor", () => {
  it("returns paginated novel ids for an author", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ novel_id: "novel-1" }) }, { data: () => ({ novel_id: "novel-2" }) }],
      empty: false,
    });

    const result = await getNovelsByAuthor("author-1");

    expect(result.items).toEqual(["novel-1", "novel-2"]);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it("returns empty when author has no novels", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const result = await getNovelsByAuthor("author-empty");

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── getNovelsByGenre ───────────────────────────────────────────────────────

describe("getNovelsByGenre", () => {
  it("returns paginated novel ids for a genre", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 3 }) });
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ novel_id: "novel-1" }) },
        { data: () => ({ novel_id: "novel-2" }) },
        { data: () => ({ novel_id: "novel-3" }) },
      ],
      empty: false,
    });

    const result = await getNovelsByGenre("genre-1");

    expect(result.items).toEqual(["novel-1", "novel-2", "novel-3"]);
    expect(result.total).toBe(3);
  });
});
