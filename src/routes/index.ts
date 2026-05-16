import type { Hono } from "hono";
import { adminCredits } from "./admin-credits.js";
import { adminNovels } from "./admin-novels.js";
import { auth } from "./auth.js";
import { credits } from "./credits.js";
import { favorites } from "./favorites.js";
import { genres } from "./genres.js";
import { health } from "./health.js";
import { history } from "./history.js";
import { novels } from "./novels.js";
import { search } from "./search.js";
import { subscriptions } from "./subscriptions.js";

export function registerRoutes(app: Hono): void {
  app.route("/api/health", health);
  app.route("/api/auth", auth);
  app.route("/api/novels", novels);
  app.route("/api/favorites", favorites);
  app.route("/api/search", search);
  app.route("/api/genres", genres);
  app.route("/api/history", history);
  app.route("/api/admin/novels", adminNovels);
  app.route("/api/subscriptions", subscriptions);
  app.route("/api/credits", credits);
  app.route("/api/admin/credits", adminCredits);
}
