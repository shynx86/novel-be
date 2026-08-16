import type { MiddlewareHandler } from "hono";
import { type Permission, SYSTEM_ROLES, isPermission } from "../config/permissions.js";
import { getFirestore } from "../services/firebase.js";
import type { Actor } from "../types/auth.js";
import { ForbiddenError } from "../utils/errors.js";

export const loadActorMiddleware: MiddlewareHandler = async (c, next) => {
  const userId = c.get("userId") as string;
  const db = getFirestore();
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) throw new ForbiddenError("User not found");

  const role = typeof userDoc.data()?.role === "string" ? userDoc.data()?.role : "user";
  const roleDoc = await db.collection("roles").doc(role).get();
  const storedPermissions = roleDoc.exists ? roleDoc.data()?.permissions : undefined;
  const permissions = Array.isArray(storedPermissions)
    ? storedPermissions.filter(isPermission)
    : [...(SYSTEM_ROLES[role]?.permissions ?? [])];

  const actor: Actor = {
    userId,
    role,
    permissions: new Set(permissions),
  };
  c.set("actor", actor);
  await next();
};

export function actorHasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const actor = c.get("actor") as Actor | undefined;
    if (!actor || !actorHasPermission(actor, permission)) {
      throw new ForbiddenError("Permission required", { permission });
    }
    await next();
  };
}

export function assertAnyPermission(actor: Actor, permissions: Permission[]): void {
  if (!permissions.some((permission) => actorHasPermission(actor, permission))) {
    throw new ForbiddenError("Permission required", { permissions });
  }
}

export function assertOwnedPermission(
  actor: Actor,
  ownerId: string | null | undefined,
  ownPermission: Permission,
  anyPermission: Permission,
): void {
  if (actorHasPermission(actor, anyPermission)) return;
  if (actorHasPermission(actor, ownPermission) && ownerId === actor.userId) return;
  throw new ForbiddenError("You do not have permission to access this resource", {
    permissions: [ownPermission, anyPermission],
  });
}
