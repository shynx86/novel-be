import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { getFirestore } from "../services/firebase.js";
import { createGenre, deleteGenre, listGenresAdmin, updateGenre } from "../services/genre-admin.js";
import { getNovelsByGenre } from "../services/novel-relation.js";
import { enrichNovelWithRelations, getNovel } from "../services/novel.js";
import { ConflictError, ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminGenres = new Hono();

adminGenres.use("/*", authMiddleware, adminMiddleware);

adminGenres.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const result = await listGenresAdmin(page, limit);
  return c.json({ data: result }, 200);
});

// GET /api/admin/genres/:genreId/novels — must be before /:genreId
adminGenres.get("/:genreId/novels", async (c) => {
  const genreId = c.req.param("genreId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await getNovelsByGenre(genreId, { page, limit });
  const novels = await Promise.all(
    result.items.map(async (novelId) => {
      const novel = await getNovel(novelId);
      return enrichNovelWithRelations(novel);
    }),
  );

  return c.json({ data: { ...result, items: novels } }, 200);
});

// GET /api/admin/genres/:genreId
adminGenres.get("/:genreId", async (c) => {
  const genreId = c.req.param("genreId");
  const db = getFirestore();
  const doc = await db.collection("genres").doc(genreId).get();
  if (!doc.exists) {
    return c.json({ error: { code: "NOT_FOUND", message: "Genre not found" } }, 404);
  }
  const data = doc.data();
  if (!data) {
    return c.json({ error: { code: "NOT_FOUND", message: "Genre not found" } }, 404);
  }
  const countSnap = await db
    .collection("novel_genres")
    .where("genre_id", "==", genreId)
    .count()
    .get();
  return c.json(
    {
      data: { id: genreId, name: data.name, slug: data.slug, novel_count: countSnap.data().count },
    },
    200,
  );
});

adminGenres.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", { field: "name" });
  }

  const genre = await createGenre({ name: body.name, slug: body.slug });
  return c.json({ data: genre }, 201);
});

adminGenres.patch("/:genreId", async (c) => {
  const genreId = c.req.param("genreId");
  const body = await c.req.json();
  const genre = await updateGenre(genreId, { name: body.name, slug: body.slug });
  return c.json({ data: genre }, 200);
});

adminGenres.delete("/:genreId", async (c) => {
  const genreId = c.req.param("genreId");

  // Check for linked novels
  const db = getFirestore();
  const linkedNovels = await db
    .collection("novel_genres")
    .where("genre_id", "==", genreId)
    .limit(1)
    .get();

  if (!linkedNovels.empty) {
    throw new ConflictError("Cannot delete genre with linked novels", {
      linked_novel_count: linkedNovels.size,
    });
  }

  await deleteGenre(genreId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminGenres };
