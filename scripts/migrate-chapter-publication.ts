import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";
const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = 400;

async function migrate() {
  const serviceAccount = JSON.parse(readFileSync("./service-account.json", "utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
  });

  const db = admin.firestore();
  const novelsSnapshot = await db.collection("novels").get();
  let batch = db.batch();
  let batchOps = 0;
  let batchCount = 0;
  let chaptersUpdated = 0;

  const commitIfNeeded = async (force = false) => {
    if (DRY_RUN || batchOps === 0 || (!force && batchOps < BATCH_SIZE)) return;
    await batch.commit();
    batchCount += 1;
    batch = db.batch();
    batchOps = 0;
  };

  console.log(`Found ${novelsSnapshot.size} novels`);
  console.log(`DRY_RUN: ${DRY_RUN}`);

  for (const [novelIndex, novelDoc] of novelsSnapshot.docs.entries()) {
    const chaptersSnapshot = await novelDoc.ref.collection("chapters").get();
    let publicChapterCount = 0;

    for (const chapterDoc of chaptersSnapshot.docs) {
      const data = chapterDoc.data();
      const status =
        data.publication_status === "draft" || data.publication_status === "scheduled"
          ? data.publication_status
          : "public";
      const publicAt =
        data.public_at ??
        (status === "public"
          ? (data.created_at ?? data.updated_at ?? new Date().toISOString())
          : null);

      if (status === "public") publicChapterCount += 1;
      if (data.publication_status !== status || data.public_at !== publicAt) {
        if (!DRY_RUN) {
          batch.update(chapterDoc.ref, {
            publication_status: status,
            public_at: publicAt,
          });
          batchOps += 1;
          await commitIfNeeded();
        }
        chaptersUpdated += 1;
      }
    }

    if (!DRY_RUN) {
      batch.update(novelDoc.ref, { public_chapter_count: publicChapterCount });
      batchOps += 1;
      await commitIfNeeded();
    }

    if ((novelIndex + 1) % 10 === 0) {
      console.log(`Processed ${novelIndex + 1}/${novelsSnapshot.size} novels`);
    }
  }

  await commitIfNeeded(true);
  console.log("--- Migration Summary ---");
  console.log(`Chapters updated: ${chaptersUpdated}`);
  console.log(`Batches committed: ${batchCount}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
