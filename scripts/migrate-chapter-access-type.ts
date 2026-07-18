import admin from "firebase-admin";
import { readFileSync } from "fs";

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

  console.log(`Found ${novelsSnapshot.size} novels`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log("---");

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalPaid = 0;
  let batchCount = 0;

  let batch = db.batch();
  let batchOps = 0;
  let novelIndex = 0;

  for (const novelDoc of novelsSnapshot.docs) {
    novelIndex++;
    const chaptersSnapshot = await novelDoc.ref.collection("chapters").get();

    if (novelIndex % 10 === 0) {
      console.log(`Processing novel ${novelIndex}/${novelsSnapshot.size}...`);
    }

    for (const chapterDoc of chaptersSnapshot.docs) {
      const data = chapterDoc.data();
      const index = data.index;
      const currentAccessType = data.access_type;

      if (currentAccessType === "paid") {
        totalPaid++;
        continue;
      }

      const expectedAccessType = index <= 10 ? "free" : "free_auth";

      if (currentAccessType === expectedAccessType) {
        totalSkipped++;
        continue;
      }

      if (!DRY_RUN) {
        batch.update(chapterDoc.ref, {
          access_type: expectedAccessType,
          updated_at: new Date().toISOString(),
        });
        batchOps++;

        if (batchOps >= BATCH_SIZE) {
          await batch.commit();
          batchCount++;
          console.log(`Batch ${batchCount} committed (${batchOps} operations)`);
          batch = db.batch();
          batchOps = 0;
        }
      }

      totalUpdated++;
    }
  }

  if (!DRY_RUN && batchOps > 0) {
    await batch.commit();
    batchCount++;
    console.log(`Batch ${batchCount} committed (${batchOps} operations)`);
  }

  console.log("\n--- Migration Summary ---");
  console.log(`Total novels: ${novelsSnapshot.size}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Skipped (already correct): ${totalSkipped}`);
  console.log(`Preserved (paid): ${totalPaid}`);
  console.log(`Batches committed: ${batchCount}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
