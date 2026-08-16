import { Hono } from "hono";
import { groupPermissionDefinitions } from "../config/permissions.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  assertAnyPermission,
  loadActorMiddleware,
  requirePermission,
} from "../middleware/authorization.js";
import { createRole, deleteRole, getRole, listRoles, updateRole } from "../services/role.js";
import type { Actor } from "../types/auth.js";

type Variables = {
  actor: Actor;
  userId: string;
};

const adminRoles = new Hono<{ Variables: Variables }>();

adminRoles.use("/*", authMiddleware, loadActorMiddleware);

adminRoles.get("/permissions", requirePermission("roles.manage"), (c) => {
  return c.json({ data: { groups: groupPermissionDefinitions() } }, 200);
});

adminRoles.get("/", async (c) => {
  assertAnyPermission(c.get("actor"), ["roles.manage", "roles.assign"]);
  const roles = await listRoles();
  return c.json({ data: roles }, 200);
});

adminRoles.get("/:roleId", requirePermission("roles.manage"), async (c) => {
  const role = await getRole(c.req.param("roleId"));
  return c.json({ data: role }, 200);
});

adminRoles.post("/", requirePermission("roles.manage"), async (c) => {
  const actor = c.get("actor") as Actor;
  const body = await c.req.json();
  const role = await createRole(body, actor.userId);
  return c.json({ data: role }, 201);
});

adminRoles.patch("/:roleId", requirePermission("roles.manage"), async (c) => {
  const actor = c.get("actor") as Actor;
  const body = await c.req.json();
  const role = await updateRole(c.req.param("roleId"), body, actor.userId);
  return c.json({ data: role }, 200);
});

adminRoles.delete("/:roleId", requirePermission("roles.manage"), async (c) => {
  const actor = c.get("actor") as Actor;
  await deleteRole(c.req.param("roleId"), actor.userId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminRoles };
