import admin from "firebase-admin";
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

    transaction.update(userRef, {
      credits: admin.firestore.FieldValue.increment(amount),
      updated_at: now,
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
