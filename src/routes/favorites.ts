import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { addFavorite, checkFavorite, listFavorites, removeFavorite } from "../services/favorite.js";
import { getPublicNovel } from "../services/novel.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const favorites = new Hono<{ Variables: Variables }>();

// GET /api/favorites
favorites.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await listFavorites(userId, { page, limit });
  return c.json({ data: result }, 200);
});

// POST /api/favorites/:novelId
favorites.post("/:novelId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);

  const favorite = await addFavorite(userId, novelId);
  return c.json({ data: favorite }, 201);
});

// DELETE /api/favorites/:novelId
favorites.delete("/:novelId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);

  await removeFavorite(userId, novelId);
  return c.json({ data: { success: true } }, 200);
});

// GET /api/favorites/check/:novelId
favorites.get("/check/:novelId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);

  const result = await checkFavorite(userId, novelId);
  return c.json({ data: result }, 200);
});

export { favorites };
