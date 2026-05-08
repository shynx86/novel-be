import { Hono } from "hono";
import { optionalAuthMiddleware } from "../middleware/optional-auth.js";
import { getChapter, getChapterMeta, listChapters } from "../services/chapter.js";
import { getNovel, listNovels } from "../services/novel.js";
import { checkSubscriptionAccess } from "../services/subscription.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

type Variables = {
  user: unknown;
  userId: string;
};

const novels = new Hono<{ Variables: Variables }>();

// GET /api/novels
novels.get("/", async (c) => {
  const page = Number(c.req.query("page")) || 1;
  const limit = Number(c.req.query("limit")) || 20;
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
  const page = Number(c.req.query("page")) || 1;
  const limit = Number(c.req.query("limit")) || 20;

  const result = await listChapters(novelId, { page, limit, includeContent: false });

  // If user is authenticated, annotate with subscription status
  const userId = c.get("userId") as string | undefined;
  if (userId) {
    const { checkSubscriptionAccess } = await import("../services/subscription.js");
    const { getNovel } = await import("../services/novel.js");

    // Check novel-level subscription once
    const hasNovelSub = await checkSubscriptionAccess(userId, novelId, -1);

    const annotatedItems = await Promise.all(
      result.items.map(async (chapter) => {
        if (chapter.access_type !== "paid") {
          return { ...chapter, is_subscribed: true };
        }
        if (hasNovelSub) {
          return { ...chapter, is_subscribed: true };
        }
        const hasAccess = await checkSubscriptionAccess(userId, novelId, chapter.index);
        return { ...chapter, is_subscribed: hasAccess };
      }),
    );
    result.items = annotatedItems;
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
        throw new ForbiddenError("You have not subscribed to this chapter");
        // details are handled via the access check endpoint
      }

      return c.json({ data: chapter }, 200);
    }
  }
});

export { novels };
