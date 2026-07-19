import type admin from "firebase-admin";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { optionalAuthMiddleware } from "../middleware/optional-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { getChapter, listChapters, listNewestChapters } from "../services/chapter.js";
import { getFirestore } from "../services/firebase.js";
import {
  enrichNovelWithRelations,
  getCompletedFeaturedNovels,
  getCompletedNovels,
  getFeaturedNovels,
  getNewestNovels,
  getPublicNovel,
  getPublicNovelBySlug,
  getRelatedNovels,
  getTrendingNovels,
  listNovelsForSitemap,
  listPublicNovels,
} from "../services/novel.js";
import { checkSubscriptionAccess, getUserSubscriptionsForNovel } from "../services/subscription.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";
import { comments } from "./comments.js";

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
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);
  const search = c.req.query("search") || undefined;
  const result = await getTrendingNovels(page, limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/completed
novels.get("/completed", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);
  const search = c.req.query("search") || undefined;
  const result = await getCompletedNovels(page, limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/featured
novels.get("/featured", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);
  const search = c.req.query("search") || undefined;
  const result = await getFeaturedNovels(page, limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/completed-featured
novels.get("/completed-featured", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);
  const search = c.req.query("search") || undefined;
  const result = await getCompletedFeaturedNovels(page, limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/newest
novels.get("/newest", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);
  const search = c.req.query("search") || undefined;
  const result = await getNewestNovels(page, limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/newest-chapters
novels.get("/newest-chapters", async (c) => {
  const requestedLimit = Number(c.req.query("limit"));
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 10;
  const search = c.req.query("search") || undefined;
  const result = await listNewestChapters(limit, search);
  return c.json({ data: result }, 200);
});

// GET /api/novels/by-slug/:slug
novels.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const novel = await getPublicNovelBySlug(slug);
  const enriched = await enrichNovelWithRelations(novel);
  return c.json({ data: enriched }, 200);
});

// GET /api/novels
novels.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const status = c.req.query("status");
  const authorId = c.req.query("author_id");
  const translatorId = c.req.query("translator_id");
  const genreId = c.req.query("genre_id");
  const search = c.req.query("search") || undefined;

  const result = await listPublicNovels({
    page,
    limit,
    status,
    author_id: authorId,
    translator_id: translatorId,
    genre_id: genreId,
    search,
  });
  return c.json({ data: result }, 200);
});

// GET /api/novels/:novelId
novels.get("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const novel = await getPublicNovel(novelId);
  const enriched = await enrichNovelWithRelations(novel);
  return c.json({ data: enriched }, 200);
});

// GET /api/novels/:novelId/related
novels.get("/:novelId/related", async (c) => {
  const novelId = c.req.param("novelId");
  const genreIndex = Math.max(0, Number(c.req.query("genre_index") || 0));
  const limit = Math.min(Number(c.req.query("limit") || 10), 50);
  await getPublicNovel(novelId);
  const result = await getRelatedNovels(novelId, genreIndex, limit);
  return c.json({ data: result }, 200);
});

// GET /api/novels/:novelId/chapters
novels.get("/:novelId/chapters", optionalAuthMiddleware, async (c) => {
  const novelId = c.req.param("novelId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  await getPublicNovel(novelId);
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

  await getPublicNovel(novelId);
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
        const novel = await getPublicNovel(novelId);
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
novels.post(
  "/:novelId/views",
  authMiddleware,
  rateLimit({ namespace: "novel-view", limit: 60, windowMs: 60_000, key: (c) => c.get("userId") }),
  async (c) => {
    const novelId = c.req.param("novelId");
    await getPublicNovel(novelId);
    const db = getFirestore();
    await db
      .collection("novels")
      .doc(novelId)
      .update({
        views: (await import("firebase-admin")).default.firestore.FieldValue.increment(1),
      });
    return c.json({ data: { success: true } }, 200);
  },
);

// Mount comments sub-routes under novels
novels.route("/", comments);

export { novels };
