import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { normalizeSearchText, searchNovels } from "../../src/services/search.js";
import {
  mockCountGet,
  mockQueryGet,
  mockQueryLimit,
  mockQueryWhere,
} from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("normalizeSearchText", () => {
  it("normalizes casing and surrounding whitespace while preserving diacritics", () => {
    expect(normalizeSearchText("  Đấu Phá: Thương Khung  ")).toBe("đấu phá: thương khung");
  });

  it("supports substring matching with exact Vietnamese diacritics", () => {
    const title = normalizeSearchText("Đấu Phá Thương Khung");
    expect(title.includes(normalizeSearchText("Á THƯƠNG"))).toBe(true);
    expect(title.includes(normalizeSearchText("pha thuong"))).toBe(false);
  });
});

describe("searchNovels", () => {
  it("enriches only the requested page for title searches", async () => {
    mockQueryGet.mockResolvedValueOnce({
      docs: [
        { id: "novel-1", data: () => ({ title: "Alpha Quest", publication_status: "public" }) },
        { id: "novel-2", data: () => ({ title: "Beta Quest", publication_status: "public" }) },
      ],
    });
    mockQueryGet.mockResolvedValue({ docs: [] });

    const result = await searchNovels({ title: "Quest", page: 2, limit: 1 });

    expect(result.total).toBe(2);
    expect(result.items.map((novel) => novel.id)).toEqual(["novel-2"]);
    expect(mockQueryWhere).toHaveBeenCalledWith("title_grams", "array-contains", "que");
    expect(mockQueryWhere).not.toHaveBeenCalledWith("novel_id", "in", ["novel-2"]);
  });

  it("returns results past the former 250-candidate cutoff", async () => {
    const candidates = Array.from({ length: 260 }, (_, index) => ({
      id: `novel-${String(index).padStart(3, "0")}`,
      data: () => ({
        title: `Quest ${String(index).padStart(3, "0")}`,
        publication_status: "public",
      }),
    }));
    mockQueryGet
      .mockResolvedValueOnce({ docs: candidates.slice(0, 100) })
      .mockResolvedValueOnce({ docs: candidates.slice(100, 200) })
      .mockResolvedValueOnce({ docs: candidates.slice(200) })
      .mockResolvedValue({ docs: [] });

    const result = await searchNovels({ title: "Quest", page: 13, limit: 20 });

    expect(result.total).toBe(260);
    expect(result.capped).toBe(false);
    expect(result.items).toHaveLength(20);
    expect(result.items[0].id).toBe("novel-240");
    expect(mockQueryWhere).toHaveBeenCalledWith("title_grams", "array-contains", "que");
    expect(mockQueryLimit).toHaveBeenCalledWith(100);
  });

  it("counts facet results and fetches only the requested page", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 900 }) });
    mockQueryGet.mockResolvedValue({ docs: [] });

    const result = await searchNovels({ genreId: "fantasy", page: 1, limit: 20 });

    expect(result.total).toBe(900);
    expect(mockQueryWhere).toHaveBeenCalledWith(
      "public_filter_keys",
      "array-contains",
      JSON.stringify([null, null, null, "fantasy"]),
    );
    expect(mockQueryLimit).toHaveBeenCalledWith(20);
    expect(mockQueryGet).toHaveBeenCalledTimes(1);
  });
});
