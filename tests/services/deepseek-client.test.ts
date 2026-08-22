import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  DeepSeekError,
  isRetryableDeepSeekError,
  rewriteChapter,
} from "../../src/services/ai/deepseek-client.js";

const base = {
  novelTitle: "Tiên Hiệp",
  chapterIndex: 1,
  chapterTitle: "Chương 1",
  sourceContent: "Nội dung chương",
  customPrompt: "",
};

function okResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "Nội dung đã biên tập" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      ...overrides,
    }),
    { status: 200 },
  );
}

describe("rewriteChapter", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("returns content and usage from a valid response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    const result = await rewriteChapter(base);

    expect(result.content).toBe("Nội dung đã biên tập");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(result.model).toBe("test-model");
  });

  it("requests low reasoning effort from OpenRouter", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    await rewriteChapter(base);

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      reasoning: { effort: "low" },
    });
  });

  it("strips markdown code fences", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        okResponse({ choices: [{ message: { content: "```text\nDoan van\n```" } }] }),
      );

    const result = await rewriteChapter(base);
    expect(result.content).toBe("Doan van");
  });

  it("treats an HTTP 429 as a retryable rate limit", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 429 }));

    await expect(rewriteChapter(base)).rejects.toBeInstanceOf(DeepSeekError);
    try {
      await rewriteChapter(base);
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekError);
      if (error instanceof DeepSeekError) {
        expect(error.type).toBe("rate_limited");
        expect(isRetryableDeepSeekError(error)).toBe(true);
      }
    }
  });

  it("treats an HTTP 500 as a retryable server error", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("treats HTTP 401 as a permanent error", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("rejects an empty response", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse({ choices: [{ message: { content: "   " } }] }));

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("rejects a response missing content", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(okResponse({ choices: [] }));

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("rejects invalid JSON", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("throws a timeout error when the request aborts", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(rewriteChapter(base)).rejects.toThrow(DeepSeekError);
  });

  it("does not include the API key in thrown errors", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    try {
      await rewriteChapter(base);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("Bearer");
      expect(message).not.toContain("test-deepseek-key");
      expect(message).not.toContain("sk-");
    }
  });
});
