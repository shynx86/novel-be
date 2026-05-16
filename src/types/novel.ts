export type NovelStatus = "ongoing" | "completed" | "hiatus";
export type ChapterAccessType = "free" | "free_auth" | "paid";
export type SubscriptionType = "chapter" | "novel";

export interface NovelDocument {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  cover_url: string;
  genre: string[];
  status: NovelStatus;
  chapter_count: number;
  total_word_count: number;
  rating: number;
  views: number;
  followers: number;
  comment_count: number;
  price: number | null;
  created_at: string;
  updated_at: string;
}

export interface NovelCreateInput {
  slug: string;
  title: string;
  description?: string;
  author: string;
  cover_url?: string;
  genre?: string[];
  status?: NovelStatus;
  rating?: number;
  views?: number;
  followers?: number;
  price?: number | null;
}

export interface NovelUpdateInput {
  slug?: string;
  title?: string;
  description?: string;
  author?: string;
  cover_url?: string;
  genre?: string[];
  status?: NovelStatus;
  rating?: number;
  views?: number;
  followers?: number;
  price?: number | null;
}

export interface ChapterDocument {
  index: number;
  title: string;
  content: string;
  word_count: number;
  access_type: ChapterAccessType;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface ChapterCreateInput {
  title: string;
  content: string;
  access_type: ChapterAccessType;
  price?: number;
}

export interface ChapterUpdateInput {
  title?: string;
  content?: string;
  access_type?: ChapterAccessType;
  price?: number;
}

export interface SubscriptionDocument {
  id: string;
  user_id: string;
  novel_id: string;
  chapter_index: number;
  type: SubscriptionType;
  credits_paid: number;
  subscribed_at: string;
}

export interface CreditTransactionDocument {
  id: string;
  user_id: string;
  type: "topup";
  amount: number;
  balance_before: number;
  balance_after: number;
  performed_by: string;
  created_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
