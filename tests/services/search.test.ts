import { describe, expect, it } from "@jest/globals";
import { normalizeSearchText } from "../../src/services/search.js";

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
