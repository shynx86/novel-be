import { describe, expect, it } from "@jest/globals";
import { buildBetaPrompt, getDefaultCustomPrompt } from "../../src/services/ai/beta-prompt.js";

describe("buildBetaPrompt", () => {
  it("includes the system instruction and chapter context", () => {
    const prompt = buildBetaPrompt({
      novelTitle: "Tiên Hiệp",
      chapterIndex: 3,
      chapterTitle: "Chương 3",
      sourceContent: "Nội dung chương.",
      customPrompt: "",
    });

    expect(prompt.system).toContain("Bạn là biên tập viên tiểu thuyết tiếng Việt");
    expect(prompt.system).toContain("Chỉ trả về nội dung chương đã được biên tập");
    expect(prompt.user).toContain("<novel-context>");
    expect(prompt.user).toContain("Tên truyện: Tiên Hiệp");
    expect(prompt.user).toContain("Chương: 3");
    expect(prompt.user).toContain("<source-chapter>");
    expect(prompt.user).toContain("Nội dung chương.");
  });

  it("uses the custom prompt when provided", () => {
    const prompt = buildBetaPrompt({
      novelTitle: "Truyện",
      chapterIndex: 1,
      chapterTitle: "Chương 1",
      sourceContent: "abc",
      customPrompt: "  Viết theo văn phong hài hước  ",
    });

    expect(prompt.user).toContain("<custom-instructions>");
    expect(prompt.user).toContain("Viết theo văn phong hài hước");
    // System instructions must never be overwritten by user input.
    expect(prompt.system).not.toContain("huyền thoại");
  });

  it("falls back to the default custom prompt when empty", () => {
    const prompt = buildBetaPrompt({
      novelTitle: "Truyện",
      chapterIndex: 1,
      chapterTitle: "Chương 1",
      sourceContent: "abc",
      customPrompt: "   ",
    });

    expect(prompt.user).toContain(getDefaultCustomPrompt());
  });

  it("adds the previous chapter context and truncates it", () => {
    const longExcerpt = "x".repeat(5000);
    const prompt = buildBetaPrompt({
      novelTitle: "Truyện",
      chapterIndex: 2,
      chapterTitle: "Chương 2",
      sourceContent: "abc",
      customPrompt: "",
      previousChapterExcerpt: longExcerpt,
    });

    expect(prompt.user).toContain("<previous-chapter-context>");
    // 5000 chars must be truncated to 2000.
    expect(prompt.user).not.toContain(longExcerpt);
    expect(prompt.user).toContain("x".repeat(2000));
  });

  it("does not include previous chapter context when absent", () => {
    const prompt = buildBetaPrompt({
      novelTitle: "Truyện",
      chapterIndex: 1,
      chapterTitle: "Chương 1",
      sourceContent: "abc",
      customPrompt: "",
    });

    expect(prompt.user).not.toContain("<previous-chapter-context>");
  });
});
