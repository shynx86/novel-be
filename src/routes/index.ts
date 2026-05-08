import type { Hono } from "hono";
import { adminCredits } from "./admin-credits.js";
import { adminNovels } from "./admin-novels.js";
import { auth } from "./auth.js";
import { credits } from "./credits.js";
import { health } from "./health.js";
import { novels } from "./novels.js";
import { subscriptions } from "./subscriptions.js";

export function registerRoutes(app: Hono): void {
  app.route("/api/health", health);
  app.route("/api/auth", auth);
  app.route("/api/novels", novels);
  app.route("/api/admin/novels", adminNovels);
  app.route("/api/subscriptions", subscriptions);
  app.route("/api/credits", credits);
  app.route("/api/admin/credits", adminCredits);
}
