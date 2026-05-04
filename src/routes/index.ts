import type { Hono } from "hono";
import { auth } from "./auth.js";
import { health } from "./health.js";

export function registerRoutes(app: Hono): void {
  app.route("/api/health", health);
  app.route("/api/auth", auth);
}
