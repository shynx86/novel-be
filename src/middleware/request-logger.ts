import type { MiddlewareHandler } from "hono";
import { logger } from "../utils/logger.js";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  c.header("X-Request-Id", requestId);

  logger.info("Incoming request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header("user-agent"),
  });

  await next();

  const duration = Date.now() - start;

  logger.info("Request completed", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });
};
