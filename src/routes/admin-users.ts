import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import {
  assertAnyPermission,
  loadActorMiddleware,
  requirePermission,
} from "../middleware/authorization.js";
import { deleteUser, getUser, listUsers, updateUser } from "../services/user-admin.js";
import type { Actor } from "../types/auth.js";
import { ForbiddenError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  actor: Actor;
  userId: string;
};

const adminUsers = new Hono<{ Variables: Variables }>();

adminUsers.use("/*", authMiddleware, loadActorMiddleware);

adminUsers.get("/", requirePermission("users.view"), async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listUsers({ page, limit, search });
  return c.json({ data: result }, 200);
});

adminUsers.get("/:userId", requirePermission("users.view"), async (c) => {
  const userId = c.req.param("userId");
  const user = await getUser(userId);
  return c.json({ data: user }, 200);
});

adminUsers.patch("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const actor = c.get("actor");

  assertAnyPermission(actor, ["users.update", "roles.assign", "credits.manage"]);
  if (body.display_name !== undefined) {
    assertAnyPermission(actor, ["users.update"]);
  }
  if (body.role !== undefined) {
    assertAnyPermission(actor, ["roles.assign"]);
    if (userId === actor.userId && body.role !== actor.role) {
      throw new ForbiddenError("You cannot change your own role");
    }
  }
  if (body.credits !== undefined) {
    assertAnyPermission(actor, ["credits.manage"]);
  }

  const user = await updateUser(userId, {
    display_name: body.display_name,
    role: body.role,
    credits: body.credits,
  });
  return c.json({ data: user }, 200);
});

adminUsers.delete("/:userId", requirePermission("users.delete"), async (c) => {
  const userId = c.req.param("userId");
  if (userId === c.get("actor").userId) {
    throw new ForbiddenError("You cannot delete your own user");
  }
  await deleteUser(userId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminUsers };
