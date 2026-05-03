import admin from "firebase-admin";
import type { Context, MiddlewareHandler } from "hono";
import { UnauthorizedError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    adminApp = admin.initializeApp();
  }
  return adminApp;
}

export async function verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
  const app = getAdminApp();
  return app.auth().verifyIdToken(token);
}

export const authMiddleware: MiddlewareHandler = async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const decodedToken = await verifyToken(token);
    c.set("user", decodedToken);
    c.set("userId", decodedToken.uid);
    await next();
  } catch (err) {
    logger.warn("Auth verification failed", {
      error: err instanceof Error ? err.message : String(err),
      path: c.req.path,
    });
    throw new UnauthorizedError("Invalid or expired token");
  }
};
