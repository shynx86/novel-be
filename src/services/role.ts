import type admin from "firebase-admin";
import {
  ADMIN_REQUIRED_PERMISSIONS,
  type Permission,
  SYSTEM_ROLES,
  isPermission,
} from "../config/permissions.js";
import type { RoleDocument } from "../types/auth.js";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

const ROLE_ID_PATTERN = /^[a-z][a-z0-9_-]{1,49}$/;

function systemRoleToDocument(roleId: string): RoleDocument | null {
  const role = SYSTEM_ROLES[roleId];
  if (!role) return null;
  return {
    ...role,
    permissions: [...role.permissions],
    created_at: null,
    updated_at: null,
    updated_by: null,
  };
}

function roleDocToData(id: string, data: admin.firestore.DocumentData): RoleDocument {
  const systemRole = SYSTEM_ROLES[id];
  return {
    id,
    name: typeof data.name === "string" ? data.name : systemRole?.name || id,
    description:
      typeof data.description === "string" ? data.description : systemRole?.description || "",
    permissions: Array.isArray(data.permissions)
      ? data.permissions.filter(isPermission)
      : [...(systemRole?.permissions ?? [])],
    is_system: Boolean(systemRole) || data.is_system === true,
    created_at: typeof data.created_at === "string" ? data.created_at : null,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
    updated_by: typeof data.updated_by === "string" ? data.updated_by : null,
  };
}

function validatePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) {
    throw new ValidationError("permissions must be an array", { field: "permissions" });
  }
  const invalid = values.filter((value) => !isPermission(value));
  if (invalid.length > 0) {
    throw new ValidationError("One or more permissions are invalid", {
      field: "permissions",
      invalid,
    });
  }
  return Array.from(new Set(values as Permission[]));
}

function validateAdminRole(permissions: Permission[]): void {
  const missing = ADMIN_REQUIRED_PERMISSIONS.filter(
    (permission) => !permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw new ValidationError("The admin role must retain critical permissions", {
      field: "permissions",
      required: ADMIN_REQUIRED_PERMISSIONS,
    });
  }
}

function buildAuditLog(input: {
  actorId: string;
  roleId: string;
  action: "create" | "update" | "delete";
  oldPermissions: Permission[];
  newPermissions: Permission[];
}) {
  return {
    actor_id: input.actorId,
    role_id: input.roleId,
    action: input.action,
    old_permissions: input.oldPermissions,
    new_permissions: input.newPermissions,
    created_at: new Date().toISOString(),
  };
}

export async function getRole(roleId: string): Promise<RoleDocument> {
  const db = getFirestore();
  const doc = await db.collection("roles").doc(roleId).get();
  if (doc.exists) {
    return roleDocToData(roleId, doc.data() ?? {});
  }
  const systemRole = systemRoleToDocument(roleId);
  if (systemRole) return systemRole;
  throw new NotFoundError("Role not found");
}

export async function listRoles(): Promise<RoleDocument[]> {
  const db = getFirestore();
  const snapshot = await db.collection("roles").orderBy("name", "asc").get();
  const roles = new Map<string, RoleDocument>();

  for (const [roleId] of Object.entries(SYSTEM_ROLES)) {
    const role = systemRoleToDocument(roleId);
    if (role) roles.set(roleId, role);
  }
  for (const doc of snapshot.docs) {
    roles.set(doc.id, roleDocToData(doc.id, doc.data()));
  }

  return Array.from(roles.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "vi"),
  );
}

export async function createRole(
  input: { id: unknown; name: unknown; description?: unknown; permissions: unknown },
  actorId: string,
): Promise<RoleDocument> {
  if (typeof input.id !== "string" || !ROLE_ID_PATTERN.test(input.id)) {
    throw new ValidationError(
      "id must contain 2-50 lowercase letters, numbers, underscores or hyphens",
      { field: "id" },
    );
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new ValidationError("name is required", { field: "name" });
  }
  if (SYSTEM_ROLES[input.id]) throw new ConflictError("Role already exists");

  const db = getFirestore();
  const ref = db.collection("roles").doc(input.id);
  const existing = await ref.get();
  if (existing.exists) throw new ConflictError("Role already exists");

  const permissions = validatePermissions(input.permissions);
  const now = new Date().toISOString();
  const data = {
    name: input.name.trim(),
    description: typeof input.description === "string" ? input.description.trim() : "",
    permissions,
    is_system: false,
    created_at: now,
    updated_at: now,
    updated_by: actorId,
  };
  const batch = db.batch();
  batch.set(ref, data);
  batch.set(
    db.collection("permission_audit_logs").doc(),
    buildAuditLog({
      actorId,
      roleId: input.id,
      action: "create",
      oldPermissions: [],
      newPermissions: permissions,
    }),
  );
  await batch.commit();
  logger.info("Role created", { roleId: input.id, actorId });
  return roleDocToData(input.id, data);
}

export async function updateRole(
  roleId: string,
  input: { name?: unknown; description?: unknown; permissions?: unknown },
  actorId: string,
): Promise<RoleDocument> {
  const existing = await getRole(roleId);
  const permissions =
    input.permissions === undefined ? existing.permissions : validatePermissions(input.permissions);
  if (roleId === "admin") validateAdminRole(permissions);

  const now = new Date().toISOString();
  const updates = {
    name:
      input.name === undefined
        ? existing.name
        : typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : (() => {
              throw new ValidationError("name cannot be empty", { field: "name" });
            })(),
    description:
      input.description === undefined
        ? existing.description
        : typeof input.description === "string"
          ? input.description.trim()
          : existing.description,
    permissions,
    is_system: existing.is_system,
    created_at: existing.created_at ?? now,
    updated_at: now,
    updated_by: actorId,
  };

  const db = getFirestore();
  const batch = db.batch();
  batch.set(db.collection("roles").doc(roleId), updates, { merge: true });
  batch.set(
    db.collection("permission_audit_logs").doc(),
    buildAuditLog({
      actorId,
      roleId,
      action: "update",
      oldPermissions: existing.permissions,
      newPermissions: permissions,
    }),
  );
  await batch.commit();
  logger.info("Role updated", { roleId, actorId });
  return roleDocToData(roleId, updates);
}

export async function deleteRole(roleId: string, actorId: string): Promise<void> {
  if (SYSTEM_ROLES[roleId]) {
    throw new ValidationError("System roles cannot be deleted");
  }
  const existing = await getRole(roleId);
  const db = getFirestore();
  const users = await db.collection("users").where("role", "==", roleId).limit(1).get();
  if (!users.empty) {
    throw new ConflictError("Role is assigned to one or more users");
  }
  const batch = db.batch();
  batch.delete(db.collection("roles").doc(roleId));
  batch.set(
    db.collection("permission_audit_logs").doc(),
    buildAuditLog({
      actorId,
      roleId,
      action: "delete",
      oldPermissions: existing.permissions,
      newPermissions: [],
    }),
  );
  await batch.commit();
  logger.info("Role deleted", { roleId, actorId });
}
