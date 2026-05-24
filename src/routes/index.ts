import type { Hono } from "hono";
import { adminAds } from "./admin-ads.js";
import { adminAuth } from "./admin-auth.js";
import { adminAuthors } from "./admin-authors.js";
import { adminCredits } from "./admin-credits.js";
import { adminGenres } from "./admin-genres.js";
import { adminNovels } from "./admin-novels.js";
import { adminSubscriptions } from "./admin-subscriptions.js";
import { adminTranslators } from "./admin-translators.js";
import { adminUpload } from "./admin-upload.js";
import { adminUsers } from "./admin-users.js";
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
  app.route("/api/subscriptions", subscriptions);
  app.route("/api/credits", credits);

  // Admin routes (Firebase auth + admin role)
  app.route("/api/admin/auth", adminAuth);
  app.route("/api/admin/novels", adminNovels);
  app.route("/api/admin/credits", adminCredits);
  app.route("/api/admin/genres", adminGenres);
  app.route("/api/admin/users", adminUsers);
  app.route("/api/admin/subscriptions", adminSubscriptions);
  app.route("/api/admin/ads", adminAds);
  app.route("/api/admin/authors", adminAuthors);
  app.route("/api/admin/translators", adminTranslators);
  app.route("/api/admin/upload", adminUpload);
}
