import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { translatorMiddleware } from "../middleware/translator.js";
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  updateChapter,
} from "../services/chapter.js";
import { setNovelAuthors, setNovelGenres } from "../services/novel-relation.js";
import {
  createNovel,
  deleteNovel,
  enrichNovelWithRelations,
  getNovel,
  listNovels,
  updateNovel,
} from "../services/novel.js";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
  isAdmin: boolean;
  isTranslator: boolean;
  userRole: string;
};

const adminNovels = new Hono<{ Variables: Variables }>();

adminNovels.use("/*", authMiddleware, translatorMiddleware);

// POST /api/admin/novels
adminNovels.post("/", async (c) => {
  const body = await c.req.json();
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;
  const isTranslator = userRole === "translator";

  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }

  // Translator automatically becomes the translator of the novel
  const translatorId = isTranslator ? userId : body.translator_id;

  const novel = await createNovel({
    slug:
      body.slug ||
      body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    title: body.title,
    description: body.description,
    cover_url: body.cover_url,
    status: body.status,
    price: body.price,
    translator_id: translatorId,
  });

  // Set relations if provided
  if (Array.isArray(body.author_ids)) {
    await setNovelAuthors(novel.id, body.author_ids);
  }
  if (Array.isArray(body.genre_ids)) {
    await setNovelGenres(novel.id, body.genre_ids);
  }

  return c.json({ data: novel }, 201);
});

// GET /api/admin/novels
adminNovels.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const status = c.req.query("status");
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Translator only sees their own novels
  const translatorId = userRole === "translator" ? userId : undefined;

  const result = await listNovels({ page, limit, status, translator_id: translatorId });
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId
adminNovels.get("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  const novel = await getNovel(novelId);

  // Translator can only access their own novels
  if (userRole === "translator" && novel.translator_id !== userId) {
    throw new ForbiddenError("You can only access your own novels");
  }

  const enriched = await enrichNovelWithRelations(novel);
  return c.json({ data: enriched }, 200);
});

// PATCH /api/admin/novels/:novelId
adminNovels.patch("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const existingNovel = await getNovel(novelId);
    if (existingNovel.translator_id !== userId) {
      throw new ForbiddenError("You can only edit your own novels");
    }
  }

  const updateData: Record<string, unknown> = {
    title: body.title,
    description: body.description,
    cover_url: body.cover_url,
    status: body.status,
    price: body.price,
  };

  // Admin can update translator_id
  if (userRole === "admin" && body.translator_id !== undefined) {
    updateData.translator_id = body.translator_id || null;
  }

  const novel = await updateNovel(novelId, updateData);

  // Update relations if provided
  if (Array.isArray(body.author_ids)) {
    await setNovelAuthors(novelId, body.author_ids);
  }
  if (Array.isArray(body.genre_ids)) {
    await setNovelGenres(novelId, body.genre_ids);
  }

  return c.json({ data: novel }, 200);
});

// DELETE /api/admin/novels/:novelId
adminNovels.delete("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const existingNovel = await getNovel(novelId);
    if (existingNovel.translator_id !== userId) {
      throw new ForbiddenError("You can only delete your own novels");
    }
  }

  await deleteNovel(novelId);
  return c.json({ data: { deleted: true } }, 200);
});

// Chapter routes

// POST /api/admin/novels/:novelId/chapters
adminNovels.post("/:novelId/chapters", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const novel = await getNovel(novelId);
    if (novel.translator_id !== userId) {
      throw new ForbiddenError("You can only add chapters to your own novels");
    }
  }

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
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const novel = await getNovel(novelId);
    if (novel.translator_id !== userId) {
      throw new ForbiddenError("You can only view chapters of your own novels");
    }
  }

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
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const novel = await getNovel(novelId);
    if (novel.translator_id !== userId) {
      throw new ForbiddenError("You can only view chapters of your own novels");
    }
  }

  const chapter = await getChapter(novelId, index);
  return c.json({ data: chapter }, 200);
});

// PATCH /api/admin/novels/:novelId/chapters/:index
adminNovels.patch("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const body = await c.req.json();
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const novel = await getNovel(novelId);
    if (novel.translator_id !== userId) {
      throw new ForbiddenError("You can only edit chapters of your own novels");
    }
  }

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
  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;

  // Check access for translator
  if (userRole === "translator") {
    const novel = await getNovel(novelId);
    if (novel.translator_id !== userId) {
      throw new ForbiddenError("You can only delete chapters of your own novels");
    }
  }

  await deleteChapter(novelId, index);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminNovels };
