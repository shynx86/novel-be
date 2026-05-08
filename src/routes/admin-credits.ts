import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { listTopupHistory, topUp } from "../services/credit.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
  isAdmin: boolean;
};

const adminCredits = new Hono<{ Variables: Variables }>();

// All admin credit routes require auth + admin
adminCredits.use("/*", authMiddleware, adminMiddleware);

// POST /api/admin/credits/topup
adminCredits.post("/topup", async (c) => {
  const body = await c.req.json();
  const adminUserId = c.get("userId") as string;

  if (!body.user_id || typeof body.user_id !== "string") {
    throw new ValidationError("user_id is required", { field: "user_id" });
  }
  if (typeof body.amount !== "number" || body.amount <= 0) {
    throw new ValidationError("amount must be a positive number", {
      field: "amount",
    });
  }

  const result = await topUp(body.user_id, body.amount, adminUserId);
  return c.json({ data: result }, 200);
});

// GET /api/admin/credits/history/:userId
adminCredits.get("/history/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 10);

  const result = await listTopupHistory(targetUserId, page, limit);
  return c.json({ data: result }, 200);
});

export { adminCredits };
