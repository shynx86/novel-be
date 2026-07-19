import type { MiddlewareHandler } from "hono";
import { AppError } from "../utils/errors.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * Lightweight abuse protection for one server instance. Use a shared store
 * when scaling the API horizontally.
 */
export function rateLimit(options: {
  namespace: string;
  limit: number;
  windowMs: number;
  key?: (c: Parameters<MiddlewareHandler>[0]) => string;
}): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const identifier = options.key?.(c) || clientIdentifier(c.req.raw);
    const bucketKey = `${options.namespace}:${identifier}`;
    const current = buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    if (current.count >= options.limit) {
      c.header("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      throw new AppError(429, "Too many requests. Please try again later.", "TOO_MANY_REQUESTS");
    }

    current.count += 1;
    await next();
  };
}
