import type { MiddlewareHandler } from "hono";
import { verifyToken } from "./auth.js";

export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decodedToken = await verifyToken(token);
      c.set("user", decodedToken);
      c.set("userId", decodedToken.uid);
    } catch {
      // Silently ignore invalid tokens for optional auth
    }
  }

  await next();
};
