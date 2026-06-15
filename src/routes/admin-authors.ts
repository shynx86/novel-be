import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  createAuthor,
  deleteAuthor,
  getAuthor,
  listAuthors,
  updateAuthor,
} from "../services/author.js";
import { getFirestore } from "../services/firebase.js";
import { getNovelsByAuthor } from "../services/novel-relation.js";
import { enrichNovelWithRelations, getNovel, listNovels } from "../services/novel.js";
import { ConflictError, ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminAuthors = new Hono();

adminAuthors.use("/*", authMiddleware, adminMiddleware);

adminAuthors.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listAuthors({ page, limit, search });
  return c.json({ data: result }, 200);
});

// GET /api/admin/authors/:authorId/novels — must be before /:authorId
adminAuthors.get("/:authorId/novels", async (c) => {
  const authorId = c.req.param("authorId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await getNovelsByAuthor(authorId, { page, limit });
  const novels = await Promise.all(
    result.items.map(async (novelId) => {
      const novel = await getNovel(novelId);
      return enrichNovelWithRelations(novel);
    }),
  );

  return c.json({ data: { ...result, items: novels } }, 200);
});

adminAuthors.get("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");
  const author = await getAuthor(authorId);
  return c.json({ data: author }, 200);
});

adminAuthors.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", { field: "name" });
  }

  const author = await createAuthor({
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: author }, 201);
});

adminAuthors.patch("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");
  const body = await c.req.json();

  const author = await updateAuthor(authorId, {
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: author }, 200);
});

adminAuthors.delete("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");

  // Check for linked novels
  const db = getFirestore();
  const linkedNovels = await db
    .collection("novel_authors")
    .where("author_id", "==", authorId)
    .limit(1)
    .get();

  if (!linkedNovels.empty) {
    throw new ConflictError("Cannot delete author with linked novels", {
      linked_novel_count: linkedNovels.size,
    });
  }

  await deleteAuthor(authorId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminAuthors };
