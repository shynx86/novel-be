import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import {
  normalizeNovelTitle,
  publicFilterKeys,
  titleGrams,
} from "../src/services/novel-list-index.js";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";
const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = 400;

function addRelation(map: Map<string, string[]>, novelId: string, entityId: string): void {
  const ids = map.get(novelId) ?? [];
  ids.push(entityId);
  map.set(novelId, ids);
}

async function backfill(): Promise<void> {
  const serviceAccount = JSON.parse(readFileSync("./service-account.json", "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
  const db = admin.firestore();
  const [novels, authorRelations, genreRelations] = await Promise.all([
    db.collection("novels").get(),
    db.collection("novel_authors").select("novel_id", "author_id").get(),
    db.collection("novel_genres").select("novel_id", "genre_id").get(),
  ]);

  const authorsByNovel = new Map<string, string[]>();
  const genresByNovel = new Map<string, string[]>();
  for (const doc of authorRelations.docs) {
    const data = doc.data();
    if (typeof data.novel_id === "string" && typeof data.author_id === "string") {
      addRelation(authorsByNovel, data.novel_id, data.author_id);
    }
  }
  for (const doc of genreRelations.docs) {
    const data = doc.data();
    if (typeof data.novel_id === "string" && typeof data.genre_id === "string") {
      addRelation(genresByNovel, data.novel_id, data.genre_id);
    }
  }

  let batch = db.batch();
  let pending = 0;
  let updated = 0;
  for (const novel of novels.docs) {
    const data = novel.data();
    const authorIds = [...new Set(authorsByNovel.get(novel.id) ?? [])].sort();
    const genreIds = [...new Set(genresByNovel.get(novel.id) ?? [])].sort();
    const publicationStatus = data.publication_status === "draft" ? "draft" : "public";
    const titleLowercase = normalizeNovelTitle(String(data.title || ""));
    const fields = {
      publication_status: publicationStatus,
      title_lowercase: titleLowercase,
      author_ids: authorIds,
      genre_ids: genreIds,
      public_filter_keys: publicFilterKeys({
        ...data,
        publication_status: publicationStatus,
        author_ids: authorIds,
        genre_ids: genreIds,
      }),
      title_grams: titleGrams(String(data.title || ""), publicationStatus === "public"),
    };
    if (
      Object.entries(fields).every(
        ([field, value]) => JSON.stringify(data[field]) === JSON.stringify(value),
      )
    ) {
      continue;
    }
    updated += 1;
    if (DRY_RUN) continue;
    batch.update(novel.ref, fields);
    pending += 1;
    if (pending === BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (!DRY_RUN && pending > 0) await batch.commit();
  console.log(`Updated ${updated} of ${novels.size} novels (${DRY_RUN ? "dry run" : "live"})`);
}

backfill().catch((error) => {
  console.error("Novel query field backfill failed:", error);
  process.exit(1);
});
