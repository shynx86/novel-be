export type NovelStatus = "ongoing" | "completed" | "hiatus";
export type ChapterAccessType = "free" | "free_auth" | "paid";
export type SubscriptionType = "chapter" | "novel";

export interface NovelDocument {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  status: NovelStatus;
  chapter_count: number;
  total_word_count: number;
  rating: number;
  views: number;
  followers: number;
  comment_count: number;
  price: number | null;
  is_featured: boolean;
  translator_id?: string;
  created_at: string;
  updated_at: string;
  genres?: { id: string; name: string }[];
  authors?: { id: string; name: string }[];
  translator?: { id: string; name: string };
}

export interface NovelCreateInput {
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  status?: NovelStatus;
  rating?: number;
  views?: number;
  followers?: number;
  price?: number | null;
  is_featured?: boolean;
  translator_id?: string;
}

export interface NovelUpdateInput {
  slug?: string;
  title?: string;
  description?: string;
  cover_url?: string;
  status?: NovelStatus;
  rating?: number;
  views?: number;
  followers?: number;
  price?: number | null;
  is_featured?: boolean;
  translator_id?: string;
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
  access_type?: ChapterAccessType;
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

export type AdPosition = "header" | "sidebar" | "footer" | "inline";

export interface AdDocument {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: AdPosition;
  is_active: boolean;
  display_order: number;
  start_date: string | null;
  end_date: string | null;
  click_count: number;
  impression_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdCreateInput {
  title: string;
  image_url: string;
  link_url: string;
  position: AdPosition;
  is_active?: boolean;
  display_order?: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface AdUpdateInput {
  title?: string;
  image_url?: string;
  link_url?: string;
  position?: AdPosition;
  is_active?: boolean;
  display_order?: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface AuthorDocument {
  id: string;
  name: string;
  slug: string;
  bio: string;
  avatar_url: string;
  novel_count: number;
  created_at: string;
  updated_at: string;
}

export interface AuthorCreateInput {
  name: string;
  slug?: string;
  bio?: string;
  avatar_url?: string;
}

export interface AuthorUpdateInput {
  name?: string;
  slug?: string;
  bio?: string;
  avatar_url?: string;
}

export interface GenreDocument {
  id: string;
  name: string;
  slug: string;
  novel_count: number;
}

export interface GenreCreateInput {
  name: string;
  slug?: string;
}

export interface GenreUpdateInput {
  name?: string;
  slug?: string;
}

// Junction collection documents

export interface NovelAuthorDocument {
  novel_id: string;
  author_id: string;
  created_at: string;
}

export interface NovelGenreDocument {
  novel_id: string;
  genre_id: string;
  created_at: string;
}

// Resolved relation types (id + name)

export interface NovelAuthorRelation {
  author_id: string;
  author_name: string;
}

export interface NovelGenreRelation {
  genre_id: string;
  genre_name: string;
}

export interface UserDocument {
  uid: string;
  email: string;
  display_name: string;
  avatar_url: string;
  credits: number;
  role: "user" | "admin" | "translator";
  created_at: string;
  updated_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
