import { Hono } from "hono";
import type admin from "firebase-admin";
import { optionalAuthMiddleware } from "../middleware/optional-auth.js";
import { getChapter, listChapters } from "../services/chapter.js";
import { comments } from "./comments.js";
import {
  getCompletedNovels,
  getNovel,
  getNovelBySlug,
  getTrendingNovels,
  listNovels,
  listNovelsForSitemap,
} from "../services/novel.js";
import { getFirestore } from "../services/firebase.js";
import { checkSubscriptionAccess, getUserSubscriptionsForNovel } from "../services/subscription.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const novels = new Hono<{ Variables: Variables }>();

// GET /api/novels/sitemap
novels.get("/sitemap", async (c) => {
  const result = await listNovelsForSitemap();
  return c.json({ data: result }, 200);
});

// GET /api/novels/trending
novels.get("/trending", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 10, 100);
  const result = await getTrendingNovels(limit);
  return c.json({ data: result }, 200);
});

// GET /api/novels/completed
novels.get("/completed", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 10, 100);
  const result = await getCompletedNovels(limit);
  return c.json({ data: result }, 200);
});

// GET /api/novels/by-slug/:slug
novels.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const novel = await getNovelBySlug(slug);
  return c.json({ data: novel }, 200);
});

// GET /api/novels
novels.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const genre = c.req.query("genre");
  const status = c.req.query("status");

  const result = await listNovels({ page, limit, genre, status });
  return c.json({ data: result }, 200);
});

// GET /api/novels/:novelId
novels.get("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const novel = await getNovel(novelId);
  return c.json({ data: novel }, 200);
});

// GET /api/novels/:novelId/chapters
novels.get("/:novelId/chapters", optionalAuthMiddleware, async (c) => {
  const novelId = c.req.param("novelId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await listChapters(novelId, { page, limit, includeContent: false });

  // If user is authenticated, annotate with subscription status
  const userId = c.get("userId") as string | undefined;
  if (userId) {
    // Single query to get all subscriptions for this user+novel
    const { hasNovelSub, subscribedChapterIndices } = await getUserSubscriptionsForNovel(
      userId,
      novelId,
    );

    result.items = result.items.map((chapter) => {
      if (chapter.access_type !== "paid") {
        return { ...chapter, is_subscribed: true };
      }
      const isSubscribed = hasNovelSub || subscribedChapterIndices.has(chapter.index);
      return { ...chapter, is_subscribed: isSubscribed };
    });
  }

  return c.json({ data: result }, 200);
});

// GET /api/novels/:novelId/chapters/:index
novels.get("/:novelId/chapters/:index", optionalAuthMiddleware, async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const userId = c.get("userId") as string | undefined;

  const chapter = await getChapter(novelId, index);

  switch (chapter.access_type) {
    case "free":
      return c.json({ data: chapter }, 200);

    case "free_auth":
      if (!userId) {
        throw new UnauthorizedError("Authentication required to read this chapter");
      }
      return c.json({ data: chapter }, 200);

    case "paid": {
      if (!userId) {
        throw new UnauthorizedError("Authentication required to read this chapter");
      }

      const hasAccess = await checkSubscriptionAccess(userId, novelId, index);
      if (!hasAccess) {
        const novel = await getNovel(novelId);
        throw new ForbiddenError("You have not subscribed to this chapter", {
          chapter_price: chapter.price,
          novel_price: novel.price,
        });
      }

      return c.json({ data: chapter }, 200);
    }
  }
});

// POST /api/novels/:novelId/views — increment view count
novels.post("/:novelId/views", async (c) => {
  const novelId = c.req.param("novelId");
  const db = getFirestore();
  await db.collection("novels").doc(novelId).update({
    views: (await import("firebase-admin")).default.firestore.FieldValue.increment(1),
  });
  return c.json({ data: { success: true } }, 200);
});

// Mount comments sub-routes under novels
novels.route("/", comments);

export { novels };
