import type { Permission } from "../config/permissions.js";

export interface Actor {
  userId: string;
  role: string;
  permissions: ReadonlySet<Permission>;
}

export interface RoleDocument {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  is_system: boolean;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}
