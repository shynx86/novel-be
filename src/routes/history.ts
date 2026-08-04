import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import {
  listReadingHistory,
  removeFromHistory,
  updateReadingProgress,
} from "../services/history.js";
import { getPublicNovel } from "../services/novel.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const history = new Hono<{ Variables: Variables }>();

// GET /api/history
history.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await listReadingHistory(userId, { page, limit });
  return c.json({ data: result }, 200);
});

// POST /api/history/:novelId
history.post("/:novelId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);
  const body = await c.req.json();

  if (typeof body.chapterIndex !== "number" || body.chapterIndex < 1) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "chapterIndex must be a positive number" } },
      400,
    );
  }

  const result = await updateReadingProgress(userId, novelId, body.chapterIndex);
  return c.json({ data: result }, 200);
});

// DELETE /api/history/:novelId
history.delete("/:novelId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const novelId = c.req.param("novelId");

  await removeFromHistory(userId, novelId);
  return c.json({ data: { success: true } }, 200);
});

export { history };
