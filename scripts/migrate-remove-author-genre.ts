/**
 * Migration: Remove author/genre from novels, create junction collections.
 *
 * This script:
 * 1. Reads all novels with `author` or `genre` fields
 * 2. Looks up corresponding author/genre documents by name
 * 3. Creates junction documents in novel_authors/novel_genres collections
 * 4. Removes `author` and `genre` fields from novel documents
 *
 * Usage:
 *   npx tsx scripts/migrate-remove-author-genre.ts
 *
 * Prerequisites:
 *   - Authors must already exist in the `authors` collection
 *   - Genres must already exist in the `genres` collection
 */

import admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || "moonlit-novel",
});

const db = admin.firestore();

async function migrate(): Promise<void> {
  console.log("Starting migration: remove author/genre from novels");

  // Step 1: Build author name → ID lookup
  console.log("Building author lookup...");
  const authorsSnapshot = await db.collection("authors").get();
  const authorNameToId = new Map<string, string>();
  for (const doc of authorsSnapshot.docs) {
    const name = doc.data().name as string;
    authorNameToId.set(name.toLowerCase(), doc.id);
  }
  console.log(`Found ${authorNameToId.size} authors`);

  // Step 2: Build genre name → ID lookup
  console.log("Building genre lookup...");
  const genresSnapshot = await db.collection("genres").get();
  const genreNameToId = new Map<string, string>();
  for (const doc of genresSnapshot.docs) {
    const name = doc.data().name as string;
    genreNameToId.set(name.toLowerCase(), doc.id);
  }
  console.log(`Found ${genreNameToId.size} genres`);

  // Step 3: Process novels
  console.log("Processing novels...");
  const novelsSnapshot = await db.collection("novels").get();
  let processed = 0;
  let skipped = 0;

  for (const novelDoc of novelsSnapshot.docs) {
    const data = novelDoc.data();
    const novelId = novelDoc.id;
    const now = new Date().toISOString();

    // Create junction documents
    const batch = db.batch();
    let hasChanges = false;

    // Handle author
    if (data.author && typeof data.author === "string") {
      const authorName = (data.author as string).toLowerCase();
      const authorId = authorNameToId.get(authorName);

      if (authorId) {
        const junctionId = `${novelId}:${authorId}`;
        const ref = db.collection("novel_authors").doc(junctionId);
        batch.set(ref, {
          novel_id: novelId,
          author_id: authorId,
          created_at: now,
        });
        console.log(`  Linking novel "${novelId}" to author "${authorId}" (${data.author})`);
        hasChanges = true;
      } else {
        console.warn(`  Author "${data.author}" not found for novel "${novelId}"`);
      }
    }

    // Handle genres
    if (Array.isArray(data.genre)) {
      for (const genreName of data.genre) {
        if (typeof genreName !== "string") continue;

        const lookupName = genreName.toLowerCase();
        const genreId = genreNameToId.get(lookupName);

        if (genreId) {
          const junctionId = `${novelId}:${genreId}`;
          const ref = db.collection("novel_genres").doc(junctionId);
          batch.set(ref, {
            novel_id: novelId,
            genre_id: genreId,
            created_at: now,
          });
          console.log(`  Linking novel "${novelId}" to genre "${genreId}" (${genreName})`);
          hasChanges = true;
        } else {
          console.warn(`  Genre "${genreName}" not found for novel "${novelId}"`);
        }
      }
    }

    // Commit junction documents
    if (hasChanges) {
      await batch.commit();
    }

    // Remove author and genre fields from novel document
    const updates: Record<string, admin.firestore.FieldValue> = {};
    if (data.author !== undefined) {
      updates.author = admin.firestore.FieldValue.delete();
    }
    if (data.genre !== undefined) {
      updates.genre = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(updates).length > 0) {
      await db.collection("novels").doc(novelId).update(updates);
      processed++;
    } else {
      skipped++;
    }
  }

  console.log(`Migration complete: ${processed} novels migrated, ${skipped} skipped (no changes)`);
}

migrate()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
