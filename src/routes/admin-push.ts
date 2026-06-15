import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { upsertNovelChapters, upsertNovelMeta } from "../services/push.js";
import { ValidationError } from "../utils/errors.js";

type Variables = {
  user: unknown;
  userId: string;
  isAdmin: boolean;
};

const adminPush = new Hono<{ Variables: Variables }>();

adminPush.use("/*", authMiddleware, adminMiddleware);

// POST /api/admin/push/novel-meta
adminPush.post("/novel-meta", async (c) => {
  const body = await c.req.json();

  if (!body.slug || typeof body.slug !== "string") {
    throw new ValidationError("slug is required", { field: "slug" });
  }
  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }

  const result = await upsertNovelMeta({
    slug: body.slug,
    title: body.title,
    description: body.description,
    cover_url: body.cover_url,
    status: body.status,
    authors: body.authors,
    genres: body.genres,
  });

  return c.json({ data: result }, 200);
});

// POST /api/admin/push/novel-chapters
adminPush.post("/novel-chapters", async (c) => {
  const body = await c.req.json();

  if (!body.novel_slug || typeof body.novel_slug !== "string") {
    throw new ValidationError("novel_slug is required", { field: "novel_slug" });
  }
  if (!Array.isArray(body.chapters) || body.chapters.length === 0) {
    throw new ValidationError("chapters is required and must be a non-empty array", {
      field: "chapters",
    });
  }

  const result = await upsertNovelChapters({
    novel_slug: body.novel_slug,
    chapters: body.chapters,
  });

  return c.json({ data: result }, 200);
});

export { adminPush };
