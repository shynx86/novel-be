import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import {
  checkAccess,
  listUserSubscriptions,
  subscribeChapter,
  subscribeNovel,
} from "../services/subscription.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const subscriptions = new Hono<{ Variables: Variables }>();

// All subscription routes require auth
subscriptions.use("/*", authMiddleware);

// POST /api/subscriptions/chapter
subscriptions.post("/chapter", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  if (!body.novel_id || typeof body.novel_id !== "string") {
    throw new ValidationError("novel_id is required", { field: "novel_id" });
  }
  if (typeof body.chapter_index !== "number" || body.chapter_index < 1) {
    throw new ValidationError("chapter_index must be a positive number", {
      field: "chapter_index",
    });
  }

  const result = await subscribeChapter(userId, body.novel_id, body.chapter_index);

  return c.json(
    {
      data: {
        novel_id: result.subscription.novel_id,
        chapter_index: result.subscription.chapter_index,
        type: result.subscription.type,
        credits_paid: result.subscription.credits_paid,
        credits_remaining: result.credits_remaining,
        subscribed_at: result.subscription.subscribed_at,
      },
    },
    200,
  );
});

// POST /api/subscriptions/novel
subscriptions.post("/novel", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  if (!body.novel_id || typeof body.novel_id !== "string") {
    throw new ValidationError("novel_id is required", { field: "novel_id" });
  }

  const result = await subscribeNovel(userId, body.novel_id);

  return c.json(
    {
      data: {
        novel_id: result.subscription.novel_id,
        chapter_index: result.subscription.chapter_index,
        type: result.subscription.type,
        credits_paid: result.subscription.credits_paid,
        credits_remaining: result.credits_remaining,
        subscribed_at: result.subscription.subscribed_at,
      },
    },
    200,
  );
});

// GET /api/subscriptions
subscriptions.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await listUserSubscriptions(userId, { page, limit });
  return c.json({ data: result }, 200);
});

// GET /api/subscriptions/check/:novelId/:index
subscriptions.get("/check/:novelId/:index", async (c) => {
  const userId = c.get("userId") as string;
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));

  const result = await checkAccess(userId, novelId, index);
  return c.json({ data: result }, 200);
});

export { subscriptions };
