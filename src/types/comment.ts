export interface CommentDocument {
  id: string;
  novel_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  content: string;
  created_at: string;
  likes: number;
  parent_id: string | null;
}

export interface CommentCreateInput {
  content: string;
  parent_id?: string;
}

export interface CommentWithReplies extends CommentDocument {
  replies: CommentWithReplies[];
}
