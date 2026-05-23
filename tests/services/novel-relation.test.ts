import { jest } from "@jest/globals";
import {
  mockBatchCommit,
  mockBatchDelete,
  mockBatchSet,
  mockCountGet,
  mockGetAll,
  mockQueryGet,
} from "../__mocks__/firebase-admin.js";

// Must import after mocks are set up
const {
  setNovelAuthors,
  setNovelTranslators,
  setNovelGenres,
  getNovelAuthors,
  getNovelTranslators,
  getNovelGenres,
  getNovelsByAuthor,
  getNovelsByTranslator,
  getNovelsByGenre,
} = await import("../../src/services/novel-relation.js");

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── setNovelAuthors ────────────────────────────────────────────────────────

describe("setNovelAuthors", () => {
  it("creates junction docs for new author ids", async () => {
    // Existing relations query → empty
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelAuthors("novel-1", ["author-1", "author-2"]);

    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("removes relations for author ids not in new list", async () => {
    // Existing relations: author-1, author-2
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } },
        { data: () => ({ author_id: "author-2" }), ref: { id: "novel-1:author-2" } },
      ],
      empty: false,
    });
    mockBatchCommit.mockResolvedValue(undefined);

    // Replace with only author-1
    await setNovelAuthors("novel-1", ["author-1"]);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when new list matches existing", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } }],
      empty: false,
    });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelAuthors("novel-1", ["author-1"]);

    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("clears all relations when empty array provided", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ author_id: "author-1" }), ref: { id: "novel-1:author-1" } }],
      empty: false,
    });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelAuthors("novel-1", []);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });
});

// ─── setNovelTranslators ────────────────────────────────────────────────────

describe("setNovelTranslators", () => {
  it("creates junction docs for new translator ids", async () => {
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelTranslators("novel-1", ["translator-1"]);

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("removes relations for translator ids not in new list", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ translator_id: "translator-1" }), ref: { id: "novel-1:translator-1" } },
        { data: () => ({ translator_id: "translator-2" }), ref: { id: "novel-1:translator-2" } },
      ],
      empty: false,
    });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelTranslators("novel-1", ["translator-1"]);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });
});

// ─── setNovelGenres ─────────────────────────────────────────────────────────

describe("setNovelGenres", () => {
  it("creates junction docs for new genre ids", async () => {
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelGenres("novel-1", ["genre-1", "genre-2", "genre-3"]);

    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("replaces all relations when list changes", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ genre_id: "genre-1" }), ref: { id: "novel-1:genre-1" } },
        { data: () => ({ genre_id: "genre-2" }), ref: { id: "novel-1:genre-2" } },
      ],
      empty: false,
    });
    mockBatchCommit.mockResolvedValue(undefined);

    await setNovelGenres("novel-1", ["genre-2", "genre-3"]);

    // genre-1 removed, genre-3 added, genre-2 unchanged
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
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

// ─── getNovelTranslators ────────────────────────────────────────────────────

describe("getNovelTranslators", () => {
  it("returns translator ids and names", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ translator_id: "translator-1" }) }],
      empty: false,
    });
    mockGetAll.mockResolvedValue([
      { exists: true, id: "translator-1", data: () => ({ name: "Translator One" }) },
    ]);

    const result = await getNovelTranslators("novel-1");

    expect(result).toEqual([{ translator_id: "translator-1", translator_name: "Translator One" }]);
  });

  it("returns empty array when no relations", async () => {
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const result = await getNovelTranslators("novel-1");

    expect(result).toEqual([]);
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

// ─── getNovelsByTranslator ──────────────────────────────────────────────────

describe("getNovelsByTranslator", () => {
  it("returns paginated novel ids for a translator", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ novel_id: "novel-3" }) }],
      empty: false,
    });

    const result = await getNovelsByTranslator("translator-1");

    expect(result.items).toEqual(["novel-3"]);
    expect(result.total).toBe(1);
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
