import type { MiddlewareHandler } from "hono";
import { revalidateFrontendCache } from "../services/cache-revalidation.js";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

export const cacheInvalidationMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  if (!MUTATING_METHODS.has(c.req.method) || c.res.status >= 400) return;

  const path = c.req.path;
  if (path.startsWith("/api/admin/genres")) {
    await revalidateFrontendCache(["genres", "genre-novels"]);
    return;
  }

  if (path.startsWith("/api/admin/novels") && !path.includes("/beta-runs")) {
    await revalidateFrontendCache(["genre-novels"]);
    return;
  }

  if (path.startsWith("/api/admin/push")) {
    await revalidateFrontendCache(["genres", "genre-novels"]);
  }
};
