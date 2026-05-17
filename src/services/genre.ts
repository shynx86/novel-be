import type admin from "firebase-admin";
import { getFirestore } from "./firebase.js";

export interface GenreDocument {
  id: string;
  name: string;
  slug: string;
  novel_count: number;
}

function genreDocToData(id: string, data: admin.firestore.DocumentData): GenreDocument {
  return {
    id,
    name: data.name,
    slug: data.slug,
    novel_count: data.novel_count ?? 0,
  };
}

export async function getGenreBySlug(slug: string): Promise<GenreDocument | null> {
  const db = getFirestore();
  const snapshot = await db.collection("genres").where("slug", "==", slug).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return genreDocToData(doc.id, doc.data());
}

export async function listGenres(): Promise<GenreDocument[]> {
  const db = getFirestore();

  const snapshot = await db.collection("genres").orderBy("name", "asc").get();

  return snapshot.docs.map((doc) => genreDocToData(doc.id, doc.data()));
}

export async function updateGenreCounts(): Promise<void> {
  const db = getFirestore();
  const genresSnapshot = await db.collection("genres").get();

  const batch = db.batch();
  for (const doc of genresSnapshot.docs) {
    const genreName = doc.data().name;
    const countSnapshot = await db
      .collection("novels")
      .where("genre", "array-contains", genreName)
      .count()
      .get();

    batch.update(doc.ref, { novel_count: countSnapshot.data().count });
  }

  await batch.commit();
}
