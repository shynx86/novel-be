import type admin from "firebase-admin";
import type { Context, MiddlewareHandler } from "hono";
import { getAuth } from "../services/firebase.js";
import { UnauthorizedError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
  const auth = getAuth();
  return auth.verifyIdToken(token);
}

export const authMiddleware: MiddlewareHandler = async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await verifyToken(token);
  } catch (err) {
    logger.warn("Auth verification failed", {
      error: err instanceof Error ? err.message : String(err),
      path: c.req.path,
    });
    throw new UnauthorizedError("Invalid or expired token");
  }

  c.set("user", decodedToken);
  c.set("userId", decodedToken.uid);
  await next();
};
