import { env } from "../../config/env.js";

export interface BetaPromptInput {
  novelTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  sourceContent: string;
  customPrompt: string;
  previousChapterExcerpt?: string;
}

export interface BuiltBetaPrompt {
  system: string;
  user: string;
}

export const DEFAULT_CUSTOM_PROMPT =
  "Viết lại nội dung chương để câu văn tự nhiên, rõ ràng và hấp dẫn hơn, " +
  "giữ nguyên toàn bộ cốt truyện, nhân vật và chi tiết.";

const PREVIOUS_CHAPTER_EXCERPT_LIMIT = 2000;

export function buildBetaPrompt(input: BetaPromptInput): BuiltBetaPrompt {
  const system = input.customPrompt.trim() || DEFAULT_CUSTOM_PROMPT;

  const parts: string[] = [];
  parts.push("<novel-context>");
  parts.push(`Tên truyện: ${input.novelTitle}`);
  parts.push(`Chương: ${input.chapterIndex}`);
  parts.push(`Tên chương: ${input.chapterTitle}`);
  parts.push("</novel-context>");

  if (input.previousChapterExcerpt) {
    parts.push("");
    parts.push("<previous-chapter-context>");
    parts.push(input.previousChapterExcerpt.slice(0, PREVIOUS_CHAPTER_EXCERPT_LIMIT));
    parts.push("</previous-chapter-context>");
  }

  parts.push("");
  parts.push("<source-chapter>");
  parts.push(input.sourceContent);
  parts.push("</source-chapter>");

  return {
    system,
    user: parts.join("\n"),
  };
}

export function getDefaultCustomPrompt(): string {
  return DEFAULT_CUSTOM_PROMPT;
}

export function getPromptTemplateVersion(): string {
  return env.betaPromptTemplateVersion;
}
