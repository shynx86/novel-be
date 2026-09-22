import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export async function revalidateFrontendCache(tags: string[]): Promise<void> {
  const uniqueTags = [...new Set(tags)];
  if (uniqueTags.length === 0 || !env.frontendRevalidationUrl || !env.cacheRevalidationSecret) {
    return;
  }

  try {
    const response = await fetch(env.frontendRevalidationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.cacheRevalidationSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags: uniqueTags }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logger.warn("Frontend cache revalidation failed", {
        status: response.status,
        tags: uniqueTags,
      });
    }
  } catch (error) {
    logger.warn("Frontend cache revalidation request failed", {
      error: error instanceof Error ? error.message : String(error),
      tags: uniqueTags,
    });
  }
}
