import admin from "firebase-admin";
import type { CreditTransactionDocument, PaginatedResult } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

export async function getBalance(userId: string): Promise<{ credits: number }> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).get();

  if (!doc.exists) {
    throw new NotFoundError("User not found");
  }

  return { credits: doc.data()?.credits || 0 };
}

export async function topUp(
  userId: string,
  amount: number,
  performedBy: string,
): Promise<{
  user_id: string;
  previous_balance: number;
  amount_added: number;
  new_balance: number;
}> {
  const db = getFirestore();
  const now = new Date().toISOString();

  const result = await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw new NotFoundError("User not found");
    }

    const previousBalance = userDoc.data()?.credits || 0;
    const newBalance = previousBalance + amount;

    transaction.update(userRef, {
      credits: admin.firestore.FieldValue.increment(amount),
      updated_at: now,
    });

    // Write transaction history inside the same transaction
    const txRef = db.collection("credit_transactions").doc();
    transaction.set(txRef, {
      user_id: userId,
      type: "topup",
      amount,
      balance_before: previousBalance,
      balance_after: newBalance,
      performed_by: performedBy,
      created_at: now,
    });

    return { previousBalance };
  });

  logger.info("Credits topped up", { userId, amount });

  return {
    user_id: userId,
    previous_balance: result.previousBalance,
    amount_added: amount,
    new_balance: result.previousBalance + amount,
  };
}

export async function listTopupHistory(
  userId: string,
  page = 1,
  limit = 10,
): Promise<PaginatedResult<CreditTransactionDocument>> {
  const db = getFirestore();
  const offset = (page - 1) * limit;

  const countSnapshot = await db
    .collection("credit_transactions")
    .where("user_id", "==", userId)
    .count()
    .get();

  const total = countSnapshot.data().count || 0;

  const snapshot = await db
    .collection("credit_transactions")
    .where("user_id", "==", userId)
    .orderBy("created_at", "desc")
    .offset(offset)
    .limit(limit)
    .get();

  const items: CreditTransactionDocument[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      user_id: data.user_id,
      type: data.type,
      amount: data.amount,
      balance_before: data.balance_before,
      balance_after: data.balance_after,
      performed_by: data.performed_by,
      created_at: data.created_at,
    };
  });

  return { items, page, limit, total };
}
