import type { Hono } from "hono";
import { health } from "./health.js";

export function registerRoutes(app: Hono): void {
  app.route("/api/health", health);
}
