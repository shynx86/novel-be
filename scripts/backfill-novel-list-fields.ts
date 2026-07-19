import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";
const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = 400;

async function backfill(): Promise<void> {
  const serviceAccount = JSON.parse(readFileSync("./service-account.json", "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });

  const db = admin.firestore();
  const snapshot = await db.collection("novels").get();
  let batch = db.batch();
  let operations = 0;
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const titleLowercase = String(data.title || "")
      .trim()
      .toLocaleLowerCase();
    if (data.publication_status === "public" && data.title_lowercase === titleLowercase) continue;

    if (!DRY_RUN) {
      batch.update(doc.ref, {
        publication_status: data.publication_status === "draft" ? "draft" : "public",
        title_lowercase: titleLowercase,
      });
      operations += 1;
      if (operations >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        operations = 0;
      }
    }
    updated += 1;
  }

  if (!DRY_RUN && operations > 0) await batch.commit();
  console.log(`Updated ${updated} of ${snapshot.size} novels (${DRY_RUN ? "dry run" : "live"})`);
}

backfill().catch((error) => {
  console.error("Novel list field backfill failed:", error);
  process.exit(1);
});
