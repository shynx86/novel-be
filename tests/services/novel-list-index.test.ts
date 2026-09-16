import { describe, expect, it } from "@jest/globals";
import {
  publicFilterKey,
  publicFilterKeys,
  searchGram,
  titleGrams,
} from "../../src/services/novel-list-index.js";

describe("public novel query fields", () => {
  it("includes combined author and genre filters only for public novels", () => {
    const fields = {
      publication_status: "public",
      status: "completed",
      translator_id: "translator-1",
      author_ids: ["author-1"],
      genre_ids: ["genre-1"],
    };
    expect(publicFilterKeys(fields)).toContain(
      publicFilterKey({
        status: "completed",
        translatorId: "translator-1",
        authorId: "author-1",
        genreId: "genre-1",
      }),
    );
    expect(publicFilterKeys({ ...fields, publication_status: "draft" })).toEqual([]);
  });

  it("indexes substrings while preserving Vietnamese casing and diacritics", () => {
    expect(titleGrams("Đấu Phá Thương Khung")).toContain(searchGram("THƯƠNG"));
    expect(titleGrams("Đấu Phá Thương Khung", false)).toEqual([]);
  });
});
