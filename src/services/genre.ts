import type admin from "firebase-admin";
import { toVietnameseSlug } from "../utils/slug.js";
import { getFirestore } from "./firebase.js";

export interface GenreDocument {
  id: string;
  name: string;
  slug: string;
}

function genreDocToData(id: string, data: admin.firestore.DocumentData): GenreDocument {
  return {
    id,
    name: data.name,
    slug: data.slug,
  };
}

export async function getGenreBySlug(slug: string): Promise<GenreDocument | null> {
  const db = getFirestore();
  const normalizedSlug = toVietnameseSlug(slug);
  if (!normalizedSlug) return null;
  const doc = await db.collection("genres").doc(normalizedSlug).get();
  const data = doc.data();
  if (!doc.exists || !data) return null;
  return genreDocToData(doc.id, data);
}

export async function listGenres(): Promise<GenreDocument[]> {
  const db = getFirestore();

  const snapshot = await db.collection("genres").orderBy("name", "asc").get();

  return snapshot.docs.map((doc) => genreDocToData(doc.id, doc.data()));
}

export async function getGenresByIds(ids: string[]): Promise<GenreDocument[]> {
  if (ids.length === 0) return [];
  const db = getFirestore();
  const refs = ids.map((id) => db.collection("genres").doc(id));
  const docs = await db.getAll(...refs);
  return (
    docs
      .filter((doc) => doc.exists && doc.data())
      // biome-ignore lint/style/noNonNullAssertion: filter guarantees data() exists
      .map((doc) => genreDocToData(doc.id, doc.data()!))
  );
}
