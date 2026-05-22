import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";

const adminAuth = new Hono();

adminAuth.use("/*", authMiddleware, adminMiddleware);

adminAuth.get("/check", (c) => {
  return c.json({ data: { authenticated: true } }, 200);
});

export { adminAuth };
