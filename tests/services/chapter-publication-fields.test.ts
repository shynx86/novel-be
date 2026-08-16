import { describe, expect, it } from "@jest/globals";
import { isChapterPublic, resolveChapterPublication } from "../../src/services/chapter.js";
import type { ChapterDocument } from "../../src/types/novel.js";

const now = "2026-08-16T10:00:00.000Z";

describe("chapter publication fields", () => {
  it("creates chapters as public immediately by default", () => {
    expect(resolveChapterPublication({}, now)).toEqual({
      publication_status: "public",
      public_at: now,
    });
  });

  it("accepts a future schedule and normalizes it to UTC", () => {
    expect(
      resolveChapterPublication(
        { publication_status: "scheduled", public_at: "2026-08-16T18:00:00+07:00" },
        now,
      ),
    ).toEqual({
      publication_status: "scheduled",
      public_at: "2026-08-16T11:00:00.000Z",
    });
  });

  it("rejects a scheduled time that has already passed", () => {
    expect(() =>
      resolveChapterPublication(
        { publication_status: "scheduled", public_at: "2026-08-16T09:00:00.000Z" },
        now,
      ),
    ).toThrow("public_at must be in the future");
  });

  it("does not expose scheduled chapters before their public time", () => {
    const chapter = {
      publication_status: "scheduled",
      public_at: "2026-08-16T11:00:00.000Z",
    } as ChapterDocument;
    expect(isChapterPublic(chapter, new Date(now))).toBe(false);
  });
});
