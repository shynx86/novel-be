export type BetaRunStatus =
  | "initializing"
  | "queued"
  | "processing"
  | "review_ready"
  | "partial_failed"
  | "failed"
  | "cancelled"
  | "publishing"
  | "published";

export type BetaChapterStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"
  | "published";

export type BetaDashboardStatus =
  | "not_started"
  | "initializing"
  | "queued"
  | "processing"
  | "review_ready"
  | "partial_failed"
  | "failed"
  | "cancelled"
  | "published";

// "deepseek" is retained for Beta runs created before the OpenRouter model catalog.
export type BetaProvider = "deepseek" | "openrouter";

export type BetaErrorType =
  | "provider"
  | "provider_rate_limited"
  | "provider_timeout"
  | "invalid_response"
  | "chapter_too_large"
  | "internal";

export interface BetaError {
  type: BetaErrorType;
  code: string;
  message: string;
  details?: unknown;
}

export interface BetaRunDocument {
  id: string;
  novel_id: string;
  status: BetaRunStatus;
  chapter_indexes: number[];
  target_count: number;
  completed_count: number;
  failed_count: number;
  current_chapter_index: number | null;
  custom_prompt: string;
  prompt_template_version: string;
  prompt_hash: string;
  provider: BetaProvider;
  model: string;
  requested_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  published_by: string | null;
  published_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  error: BetaError | null;
}

export interface BetaSourceChapterDocument {
  index: number;
  title: string;
  content: string;
  word_count: number;
  source_hash: string;
  source_updated_at: string;
  created_at: string;
}

export interface BetaChapterDocument {
  index: number;
  title: string;
  content: string | null;
  word_count: number | null;
  status: BetaChapterStatus;
  source_hash: string;
  attempt_count: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  processing_started_at: string | null;
  completed_at: string | null;
  published_at: string | null;
  error: BetaError | null;
}

export interface NovelBetaSummary {
  beta_status: BetaDashboardStatus;
  has_published_beta: boolean;
  active_beta_run_id: string | null;
  latest_beta_run_id: string | null;
  beta_target_count: number;
  beta_completed_count: number;
  beta_failed_count: number;
  beta_updated_at: string | null;
  beta_last_published_at: string | null;
}

export interface BetaRunCreateResult {
  id: string;
  status: BetaRunStatus;
  target_count: number;
  completed_count: number;
  failed_count: number;
  first_chapter_index: number;
}

export interface BetaChapterComparison {
  source: {
    title: string;
    content: string;
    word_count: number;
  };
  beta: {
    content: string | null;
    word_count: number | null;
    status: BetaChapterStatus;
    model: string;
    attempt_count: number;
    usage: BetaChapterDocument["usage"];
    error: BetaError | null;
  };
}
