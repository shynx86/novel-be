import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { getBalance, listTopupHistory } from "../services/credit.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
};

const credits = new Hono<{ Variables: Variables }>();

// GET /api/credits/balance
credits.get("/balance", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const result = await getBalance(userId);
  return c.json({ data: result }, 200);
});

// GET /api/credits/history
credits.get("/history", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);

  const result = await listTopupHistory(userId, page, limit);
  return c.json({ data: result }, 200);
});

export { credits };
