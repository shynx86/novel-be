import { env } from "../../config/env.js";
import { buildBetaPrompt } from "./beta-prompt.js";

export interface RewriteChapterInput {
  novelTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  sourceContent: string;
  customPrompt: string;
  previousChapterExcerpt?: string;
}

export interface RewriteChapterResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type DeepSeekErrorType =
  | "timeout"
  | "rate_limited"
  | "server"
  | "invalid_response"
  | "permanent";

export class DeepSeekError extends Error {
  public readonly type: DeepSeekErrorType;
  public readonly statusCode: number | null;
  public readonly details?: unknown;

  constructor(type: DeepSeekErrorType, message: string, statusCode: number | null = null) {
    super(message);
    this.name = "DeepSeekError";
    this.type = type;
    this.statusCode = statusCode;
  }
}

export function isRetryableDeepSeekError(error: DeepSeekError): boolean {
  return (
    error.type === "timeout" ||
    error.type === "rate_limited" ||
    error.type === "server" ||
    error.type === "invalid_response"
  );
}

interface DeepSeekChatMessage {
  role: "system" | "user";
  content: string;
}

interface DeepSeekApiResponse {
  choices?: {
    message?: {
      content?: unknown;
    };
  }[];
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fence = /^```(?:[a-zA-Z]*)\n?([\s\S]*?)(?:```)?$/;
  const match = trimmed.match(fence);
  if (match?.[1]) {
    return match[1].replace(/\n$/, "").trim();
  }
  return content;
}

function toPositiveInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function classifyError(status: number): DeepSeekError {
  if (status === 408) {
    return new DeepSeekError("timeout", "AI provider request timed out", status);
  }
  if (status === 429) {
    return new DeepSeekError("rate_limited", "AI provider rate limited", status);
  }
  if (status >= 500 && status <= 599) {
    return new DeepSeekError("server", `AI provider server error (${status})`, status);
  }
  if (status === 401 || status === 403) {
    return new DeepSeekError("permanent", "AI provider authentication failed", status);
  }
  if (status === 404) {
    return new DeepSeekError("permanent", "AI model not found", status);
  }
  if (status === 413) {
    return new DeepSeekError("permanent", "AI provider request payload too large", status);
  }
  if (status === 400) {
    return new DeepSeekError("permanent", "AI provider rejected the request", status);
  }
  return new DeepSeekError("permanent", `AI provider request failed (${status})`, status);
}

export async function rewriteChapter(
  input: RewriteChapterInput,
  options: { apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number } = {},
): Promise<RewriteChapterResult> {
  const apiKey = options.apiKey ?? env.deepSeekApiKey;
  const baseUrl = options.baseUrl ?? env.deepSeekBaseUrl;
  const model = options.model ?? env.deepSeekModel;
  const timeoutMs = options.timeoutMs ?? env.deepSeekTimeoutMs;

  if (!apiKey) {
    throw new DeepSeekError("permanent", "AI provider API key is not configured");
  }
  if (!model) {
    throw new DeepSeekError("permanent", "AI model is not configured");
  }

  const prompt = buildBetaPrompt(input);
  const messages: DeepSeekChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        reasoning: {
          effort: "low",
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekError("timeout", "AI provider request timed out");
    }
    throw new DeepSeekError("server", `AI provider connection failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Do not leak the API key or full response body into errors.
    throw classifyError(response.status);
  }

  let payload: DeepSeekApiResponse;
  try {
    payload = (await response.json()) as DeepSeekApiResponse;
  } catch {
    throw new DeepSeekError("invalid_response", "AI provider returned an invalid JSON response");
  }

  const rawContent = payload.choices?.[0]?.message?.content;
  if (typeof rawContent !== "string") {
    throw new DeepSeekError("invalid_response", "AI response is missing content");
  }

  const content = stripCodeFence(rawContent);
  if (!content.trim()) {
    throw new DeepSeekError("invalid_response", "AI provider returned an empty response");
  }

  const usage = {
    promptTokens: toPositiveInt(payload.usage?.prompt_tokens),
    completionTokens: toPositiveInt(payload.usage?.completion_tokens),
    totalTokens: toPositiveInt(payload.usage?.total_tokens),
  };

  return { content, model, usage };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
