import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { getBalance } from "../services/credit.js";

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

export { credits };
