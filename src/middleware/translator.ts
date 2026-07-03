import type { MiddlewareHandler } from "hono";
import { getFirestore } from "../services/firebase.js";
import { ForbiddenError } from "../utils/errors.js";

export const translatorMiddleware: MiddlewareHandler = async (c, next) => {
  const userId = c.get("userId") as string;
  const db = getFirestore();
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    throw new ForbiddenError("User not found");
  }

  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "translator") {
    throw new ForbiddenError("Translator or admin access required");
  }

  c.set("isAdmin", role === "admin");
  c.set("isTranslator", role === "translator");
  c.set("userRole", role);
  await next();
};
