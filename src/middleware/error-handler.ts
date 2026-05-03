import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const ERROR_STATUS_CODES: Record<string, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn("AppError", {
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
        path: c.req.path,
      });

      const statusCode = ERROR_STATUS_CODES[err.code] ?? 500;

      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err instanceof ValidationError && { details: err.details }),
          },
        },
        statusCode,
      );
    }

    logger.error("Unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      path: c.req.path,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      },
      500,
    );
  }
};
