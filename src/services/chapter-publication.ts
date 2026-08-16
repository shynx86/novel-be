import admin from "firebase-admin";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

const BATCH_LIMIT = 200;

/**
 * Publishes due chapters transactionally. The status check inside each transaction
 * makes retries safe and prevents public_chapter_count from being incremented twice.
 */
export async function publishDueChapters(now = new Date()): Promise<number> {
  const db = getFirestore();
  const nowIso = now.toISOString();
  const snapshot = await db
    .collectionGroup("chapters")
    .where("publication_status", "==", "scheduled")
    .where("public_at", "<=", nowIso)
    .orderBy("public_at", "asc")
    .limit(BATCH_LIMIT)
    .get();

  let publishedCount = 0;
  for (const scheduledChapter of snapshot.docs) {
    const novelRef = scheduledChapter.ref.parent.parent;
    if (!novelRef) continue;

    const published = await db.runTransaction(async (transaction) => {
      const freshChapter = await transaction.get(scheduledChapter.ref);
      const data = freshChapter.data();
      if (
        !freshChapter.exists ||
        !data ||
        data.publication_status !== "scheduled" ||
        typeof data.public_at !== "string" ||
        data.public_at > nowIso
      ) {
        return false;
      }

      transaction.update(scheduledChapter.ref, {
        publication_status: "public",
        updated_at: nowIso,
      });
      transaction.update(novelRef, {
        public_chapter_count: admin.firestore.FieldValue.increment(1),
        updated_at: nowIso,
      });
      return true;
    });

    if (published) publishedCount += 1;
  }

  if (publishedCount > 0) {
    logger.info("Scheduled chapters published", { publishedCount, checkedAt: nowIso });
  }
  return publishedCount;
}
