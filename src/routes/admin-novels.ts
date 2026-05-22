import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  updateChapter,
} from "../services/chapter.js";
import { createNovel, deleteNovel, getNovel, listNovels, updateNovel } from "../services/novel.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
  isAdmin: boolean;
};

const adminNovels = new Hono<{ Variables: Variables }>();

adminNovels.use("/*", authMiddleware, adminMiddleware);

// POST /api/admin/novels
adminNovels.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }
  if (!body.author || typeof body.author !== "string") {
    throw new ValidationError("author is required", { field: "author" });
  }

  const novel = await createNovel({
    slug:
      body.slug ||
      body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    title: body.title,
    description: body.description,
    author: body.author,
    cover_url: body.cover_url,
    genre: body.genre,
    status: body.status,
    price: body.price,
  });

  return c.json({ data: novel }, 201);
});

// GET /api/admin/novels
adminNovels.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const genre = c.req.query("genre");
  const status = c.req.query("status");

  const result = await listNovels({ page, limit, genre, status });
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId
adminNovels.get("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const novel = await getNovel(novelId);
  return c.json({ data: novel }, 200);
});

// PATCH /api/admin/novels/:novelId
adminNovels.patch("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();

  const novel = await updateNovel(novelId, {
    title: body.title,
    description: body.description,
    author: body.author,
    cover_url: body.cover_url,
    genre: body.genre,
    status: body.status,
    price: body.price,
  });

  return c.json({ data: novel }, 200);
});

// DELETE /api/admin/novels/:novelId
adminNovels.delete("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  await deleteNovel(novelId);
  return c.json({ data: { deleted: true } }, 200);
});

// Chapter routes

// POST /api/admin/novels/:novelId/chapters
adminNovels.post("/:novelId/chapters", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();

  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }
  if (!body.content || typeof body.content !== "string") {
    throw new ValidationError("content is required", { field: "content" });
  }
  if (!body.access_type || !["free", "free_auth", "paid"].includes(body.access_type)) {
    throw new ValidationError("access_type must be one of: free, free_auth, paid", {
      field: "access_type",
    });
  }

  const chapter = await createChapter(novelId, {
    title: body.title,
    content: body.content,
    access_type: body.access_type,
    price: body.price,
  });

  return c.json({ data: chapter }, 201);
});

// GET /api/admin/novels/:novelId/chapters
adminNovels.get("/:novelId/chapters", async (c) => {
  const novelId = c.req.param("novelId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 100);

  const result = await listChapters(novelId, {
    page,
    limit,
    includeContent: true,
  });
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId/chapters/:index
adminNovels.get("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));

  const chapter = await getChapter(novelId, index);
  return c.json({ data: chapter }, 200);
});

// PATCH /api/admin/novels/:novelId/chapters/:index
adminNovels.patch("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const body = await c.req.json();

  if (body.access_type !== undefined && !["free", "free_auth", "paid"].includes(body.access_type)) {
    throw new ValidationError("access_type must be one of: free, free_auth, paid", {
      field: "access_type",
    });
  }

  const chapter = await updateChapter(novelId, index, {
    title: body.title,
    content: body.content,
    access_type: body.access_type,
    price: body.price,
  });

  return c.json({ data: chapter }, 200);
});

// DELETE /api/admin/novels/:novelId/chapters/:index
adminNovels.delete("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));

  await deleteChapter(novelId, index);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminNovels };
