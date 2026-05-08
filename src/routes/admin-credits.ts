import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { topUp } from "../services/credit.js";
import { ValidationError } from "../utils/errors.js";

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

  if (!body.user_id || typeof body.user_id !== "string") {
    throw new ValidationError("user_id is required", { field: "user_id" });
  }
  if (typeof body.amount !== "number" || body.amount <= 0) {
    throw new ValidationError("amount must be a positive number", {
      field: "amount",
    });
  }

  const result = await topUp(body.user_id, body.amount);
  return c.json({ data: result }, 200);
});

export { adminCredits };
