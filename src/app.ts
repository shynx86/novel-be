import { Hono } from "hono";
import { requestLogger } from "./middleware/request-logger.js";
import { registerRoutes } from "./routes/index.js";

const app = new Hono();

// Global middleware
app.use(requestLogger);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    500,
  );
});

// Register all routes
registerRoutes(app);

export { app };
