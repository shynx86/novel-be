import { Hono } from "hono";
import { translatorMiddleware } from "../middleware/translator.js";
import { authMiddleware } from "../middleware/auth.js";

const adminAuth = new Hono();

adminAuth.use("/*", authMiddleware, translatorMiddleware);

adminAuth.get("/check", (c) => {
  return c.json({ data: { authenticated: true } }, 200);
});

export { adminAuth };
