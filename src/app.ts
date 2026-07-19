import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { requestLogger } from "./middleware/request-logger.js";
import { registerRoutes } from "./routes/index.js";
import { AppError, ForbiddenError, PaymentRequiredError, ValidationError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

const app = new Hono();

// Global middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "https://novel-fe-six.vercel.app"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(
  bodyLimit({
    maxSize: 1_000_000,
    onError: (c) =>
      c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body must be 1 MB or smaller" } },
        413,
      ),
  }),
);
app.use(requestLogger);

app.onError((err, c) => {
  if (err instanceof AppError) {
    const statusCodes: Record<string, ContentfulStatusCode> = {
      NOT_FOUND: 404,
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      CONFLICT: 409,
      INSUFFICIENT_CREDITS: 402,
      TOO_MANY_REQUESTS: 429,
    };

    logger.warn("AppError", {
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      path: c.req.path,
    });

    const statusCode = statusCodes[err.code] ?? err.statusCode;

    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...((err instanceof ValidationError ||
            err instanceof PaymentRequiredError ||
            err instanceof ForbiddenError) && {
            details: err.details,
          }),
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
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    500,
  );
});

// Register all routes
registerRoutes(app);

export { app };
