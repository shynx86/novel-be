import type { MiddlewareHandler } from "hono";
import { getFirestore } from "../services/firebase.js";
import { ForbiddenError } from "../utils/errors.js";

export const adminMiddleware: MiddlewareHandler = async (c, next) => {
  const userId = c.get("userId") as string;
  const db = getFirestore();
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }

  c.set("isAdmin", true);
  c.set("userRole", "admin");
  await next();
};
