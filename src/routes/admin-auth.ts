import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { loadActorMiddleware, requirePermission } from "../middleware/authorization.js";
import type { Actor } from "../types/auth.js";

type Variables = {
  actor: Actor;
  userId: string;
};

const adminAuth = new Hono<{ Variables: Variables }>();

adminAuth.use("/*", authMiddleware, loadActorMiddleware, requirePermission("admin.access"));

adminAuth.get("/check", (c) => {
  const actor = c.get("actor");
  return c.json(
    {
      data: {
        authenticated: true,
        role: actor.role,
        permissions: Array.from(actor.permissions),
      },
    },
    200,
  );
});

export { adminAuth };
