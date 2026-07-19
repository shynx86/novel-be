import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { createComment, deleteComment, likeComment, listComments } from "../services/comment.js";
import { getPublicNovel } from "../services/novel.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const comments = new Hono<{ Variables: Variables }>();

// GET /api/novels/:novelId/comments
comments.get("/:novelId/comments", async (c) => {
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 50);

  const result = await listComments(novelId, { page, limit });
  return c.json({ data: result }, 200);
});

// POST /api/novels/:novelId/comments
comments.post(
  "/:novelId/comments",
  authMiddleware,
  rateLimit({
    namespace: "comment-create",
    limit: 10,
    windowMs: 60_000,
    key: (c) => c.get("userId"),
  }),
  async (c) => {
    const novelId = c.req.param("novelId");
    await getPublicNovel(novelId);
    const userId = c.get("userId");
    const body = await c.req.json();

    const user = c.get("user") as { name?: string; picture?: string } | undefined;
    const userName = user?.name || "Anonymous";
    const userAvatar = user?.picture ?? null;

    const comment = await createComment(novelId, userId, userName, userAvatar, {
      content: body.content,
      parent_id: body.parent_id,
    });

    return c.json({ data: comment }, 201);
  },
);

// DELETE /api/novels/:novelId/comments/:commentId
comments.delete("/:novelId/comments/:commentId", authMiddleware, async (c) => {
  const novelId = c.req.param("novelId");
  await getPublicNovel(novelId);
  const commentId = c.req.param("commentId");
  const userId = c.get("userId");

  await deleteComment(novelId, commentId, userId);
  return c.json({ data: { success: true } }, 200);
});

// POST /api/novels/:novelId/comments/:commentId/like
comments.post(
  "/:novelId/comments/:commentId/like",
  authMiddleware,
  rateLimit({
    namespace: "comment-like",
    limit: 30,
    windowMs: 60_000,
    key: (c) => c.get("userId"),
  }),
  async (c) => {
    const novelId = c.req.param("novelId");
    await getPublicNovel(novelId);
    const commentId = c.req.param("commentId");

    const comment = await likeComment(novelId, commentId, c.get("userId"));
    return c.json({ data: comment }, 200);
  },
);

export { comments };
