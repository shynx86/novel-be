import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { loadActorMiddleware, requirePermission } from "../middleware/authorization.js";
import {
  deleteSubscription,
  getSubscription,
  listSubscriptions,
} from "../services/subscription-admin.js";
import { parsePagination } from "../utils/pagination.js";

const adminSubscriptions = new Hono();

adminSubscriptions.use(
  "/*",
  authMiddleware,
  loadActorMiddleware,
  requirePermission("subscriptions.manage"),
);

adminSubscriptions.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const user_id = c.req.query("user_id") || undefined;
  const novel_id = c.req.query("novel_id") || undefined;
  const type = c.req.query("type") || undefined;

  const result = await listSubscriptions({ page, limit, user_id, novel_id, type });
  return c.json({ data: result }, 200);
});

adminSubscriptions.get("/:subId", async (c) => {
  const subId = c.req.param("subId");
  const sub = await getSubscription(subId);
  return c.json({ data: sub }, 200);
});

adminSubscriptions.delete("/:subId", async (c) => {
  const subId = c.req.param("subId");
  await deleteSubscription(subId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminSubscriptions };
