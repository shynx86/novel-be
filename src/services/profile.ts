import type { NovelStatus } from "../types/novel.js";
import { NotFoundError } from "../utils/errors.js";
import { getFirestore } from "./firebase.js";

export interface PublicUserProfile {
  uid: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  role: string;
  created_at: string;
}

export interface TranslatorNovelSummary {
  id: string;
  slug: string;
  title: string;
  cover_url: string;
  status: NovelStatus;
  chapter_count: number;
  views: number;
  followers: number;
  updated_at: string;
}

export interface TranslatorStats {
  novel_count: number;
  public_count: number;
  draft_count: number;
  chapter_count: number;
  total_views: number;
  total_followers: number;
  total_comments: number;
  top_novels: TranslatorNovelSummary[];
}

function publicProfileFromData(
  uid: string,
  data: FirebaseFirestore.DocumentData,
): PublicUserProfile {
  return {
    uid,
    username: data.username || `user_${uid}`,
    display_name: data.display_name || data.username || `user_${uid}`,
    avatar_url: data.avatar_url || "",
    bio: data.bio || "",
    role: data.role || "user",
    created_at: data.created_at || new Date(0).toISOString(),
  };
}

export async function getPublicUserProfile(username: string): Promise<PublicUserProfile> {
  const normalized = username.trim().toLowerCase();
  const db = getFirestore();
  const snapshot = await db
    .collection("users")
    .where("username_lowercase", "==", normalized)
    .limit(1)
    .get();

  const matched = snapshot.docs[0];
  if (matched) return publicProfileFromData(matched.id, matched.data());

  // Compatibility for accounts created before username was introduced.
  if (normalized.startsWith("user_")) {
    const uid = username.slice(5);
    const legacy = await db.collection("users").doc(uid).get();
    const legacyData = legacy.data();
    if (legacy.exists && legacyData) return publicProfileFromData(uid, legacyData);
  }

  throw new NotFoundError("Không tìm thấy hồ sơ người dùng");
}

export async function getTranslatorStats(
  userId: string,
  options: { publicOnly?: boolean } = {},
): Promise<TranslatorStats> {
  const db = getFirestore();
  const snapshot = await db.collection("novels").where("translator_id", "==", userId).get();
  const novels = snapshot.docs
    .map((doc): FirebaseFirestore.DocumentData & { id: string } => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((novel) => !options.publicOnly || novel.publication_status === "public");
  const publicNovels = novels.filter((novel) => novel.publication_status === "public");
  const draftNovels = novels.filter((novel) => novel.publication_status !== "public");

  const topNovels = [...novels]
    .sort((left, right) => Number(right.views || 0) - Number(left.views || 0))
    .slice(0, 5)
    .map((novel) => ({
      id: novel.id,
      slug: String(novel.slug || novel.id),
      title: String(novel.title || ""),
      cover_url: String(novel.cover_url || ""),
      status: (novel.status || "ongoing") as NovelStatus,
      chapter_count: Number(novel.chapter_count || 0),
      views: Number(novel.views || 0),
      followers: Number(novel.followers || 0),
      updated_at: String(novel.updated_at || ""),
    }));

  return {
    novel_count: novels.length,
    public_count: publicNovels.length,
    draft_count: options.publicOnly ? 0 : draftNovels.length,
    chapter_count: novels.reduce((sum, novel) => sum + Number(novel.chapter_count || 0), 0),
    total_views: novels.reduce((sum, novel) => sum + Number(novel.views || 0), 0),
    total_followers: novels.reduce((sum, novel) => sum + Number(novel.followers || 0), 0),
    total_comments: novels.reduce((sum, novel) => sum + Number(novel.comment_count || 0), 0),
    top_novels: topNovels,
  };
}
