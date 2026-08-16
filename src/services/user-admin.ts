import type admin from "firebase-admin";
import type { PaginatedResult, UserDocument } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";
import { getRole } from "./role.js";

function userDocToData(uid: string, data: admin.firestore.DocumentData): UserDocument {
  return {
    uid,
    email: data.email,
    display_name: data.display_name,
    avatar_url: data.avatar_url || "",
    credits: data.credits ?? 0,
    role: data.role ?? "user",
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listUsers(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResult<UserDocument>> {
  const db = getFirestore();
  const { page, limit, search } = params;

  let query: admin.firestore.Query = db.collection("users").orderBy("created_at", "desc");

  if (search) {
    const searchLower = search.toLowerCase();
    query = db
      .collection("users")
      .orderBy("email")
      .startAt(searchLower)
      .endAt(`${searchLower}\uf8ff`);
  }

  const totalCount = await db.collection("users").count().get();
  const total = totalCount.data().count;

  if (page > 1) {
    query = query.offset((page - 1) * limit);
  }

  const snapshot = await query.limit(limit).get();
  const users = snapshot.docs.map((doc) => userDocToData(doc.id, doc.data()));

  return { items: users, page, limit, total };
}

export async function getUser(uid: string): Promise<UserDocument> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(uid).get();
  const data = doc.data();
  if (!doc.exists || !data) throw new NotFoundError("User not found");
  return userDocToData(uid, data);
}

export async function updateUser(
  uid: string,
  input: { display_name?: string; role?: string; credits?: number },
): Promise<UserDocument> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(uid).get();
  if (!doc.exists) throw new NotFoundError("User not found");

  if (input.role !== undefined) {
    await getRole(input.role);
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (input.display_name !== undefined) updates.display_name = input.display_name;
  if (input.role !== undefined) updates.role = input.role;
  if (input.credits !== undefined) updates.credits = input.credits;

  await db.collection("users").doc(uid).update(updates);
  logger.info("User updated by admin", { uid });

  const updated = await db.collection("users").doc(uid).get();
  const data = updated.data();
  if (!data) throw new NotFoundError("User not found after update");
  return userDocToData(uid, data);
}

export async function deleteUser(uid: string): Promise<void> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(uid).get();
  if (!doc.exists) throw new NotFoundError("User not found");

  await db.collection("users").doc(uid).delete();
  logger.info("User deleted by admin", { uid });
}
