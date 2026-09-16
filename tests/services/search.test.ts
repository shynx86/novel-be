import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { normalizeSearchText, searchNovels } from "../../src/services/search.js";
import { mockQueryGet, mockQueryWhere } from "../__mocks__/firebase-admin.js";

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
    expect(mockQueryWhere).toHaveBeenCalledWith("novel_id", "in", ["novel-2"]);
  });
});
