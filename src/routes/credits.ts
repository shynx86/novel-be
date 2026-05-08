import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { getBalance, listTopupHistory } from "../services/credit.js";

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
  const page = Number(c.req.query("page")) || 1;
  const limit = Number(c.req.query("limit")) || 10;

  const result = await listTopupHistory(userId, page, limit);
  return c.json({ data: result }, 200);
});

export { credits };
