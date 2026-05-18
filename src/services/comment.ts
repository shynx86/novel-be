import admin from "firebase-admin";
import type { CommentCreateInput, CommentDocument, CommentWithReplies } from "../types/comment.js";
import type { PaginatedResult } from "../types/novel.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getFirestore } from "./firebase.js";

function commentDocToData(
  id: string,
  data: admin.firestore.DocumentData,
  novelId: string,
): CommentDocument {
  return {
    id,
    novel_id: novelId,
    user_id: data.user_id,
    user_name: data.user_name,
    user_avatar: data.user_avatar ?? null,
    content: data.content,
    created_at: data.created_at,
    likes: data.likes ?? 0,
    parent_id: data.parent_id ?? null,
  };
}

export async function createComment(
  novelId: string,
  userId: string,
  userName: string,
  userAvatar: string | null,
  input: CommentCreateInput,
): Promise<CommentDocument> {
  const db = getFirestore();

  if (!input.content || input.content.trim().length === 0) {
    throw new ValidationError("Comment content is required");
  }

  if (input.content.length > 2000) {
    throw new ValidationError("Comment content must be 2000 characters or less");
  }

  if (input.parent_id) {
    const parentDoc = await db
      .collection("novels")
      .doc(novelId)
      .collection("comments")
      .doc(input.parent_id)
      .get();
    if (!parentDoc.exists) {
      throw new NotFoundError("Parent comment not found");
    }
  }

  const now = new Date().toISOString();
  const docData = {
    user_id: userId,
    user_name: userName,
    user_avatar: userAvatar,
    content: input.content.trim(),
    created_at: now,
    likes: 0,
    parent_id: input.parent_id ?? null,
  };

  const ref = await db.collection("novels").doc(novelId).collection("comments").add(docData);

  // Increment comment count on novel
  await db
    .collection("novels")
    .doc(novelId)
    .update({
      comment_count: admin.firestore.FieldValue.increment(1),
    });

  logger.info("Comment created", { novelId, commentId: ref.id, userId });

  return commentDocToData(ref.id, docData, novelId);
}

export async function listComments(
  novelId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<CommentWithReplies>> {
  const db = getFirestore();
  const page = params.page || 1;
  const limit = Math.min(params.limit || 50, 100);

  const snapshot = await db
    .collection("novels")
    .doc(novelId)
    .collection("comments")
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit)
    .get();

  const totalCount = await db
    .collection("novels")
    .doc(novelId)
    .collection("comments")
    .count()
    .get();

  const total = totalCount.data().count;

  const allComments = snapshot.docs.map((doc) => commentDocToData(doc.id, doc.data(), novelId));

  // Build threaded tree
  const commentMap = new Map<string, CommentWithReplies>();
  const rootComments: CommentWithReplies[] = [];

  for (const comment of allComments) {
    commentMap.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of allComments) {
    const node = commentMap.get(comment.id);
    if (!node) continue;
    if (comment.parent_id && commentMap.has(comment.parent_id)) {
      commentMap.get(comment.parent_id)?.replies.push(node);
    } else {
      rootComments.push(node);
    }
  }

  return { items: rootComments, page, limit, total };
}

export async function deleteComment(
  novelId: string,
  commentId: string,
  userId: string,
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection("novels").doc(novelId).collection("comments").doc(commentId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new NotFoundError("Comment not found");
  }

  const data = doc.data();
  if (data?.user_id !== userId) {
    throw new UnauthorizedError("You can only delete your own comments");
  }

  await docRef.delete();

  // Decrement comment count on novel
  await db
    .collection("novels")
    .doc(novelId)
    .update({
      comment_count: admin.firestore.FieldValue.increment(-1),
    });

  logger.info("Comment deleted", { novelId, commentId, userId });
}

export async function likeComment(novelId: string, commentId: string): Promise<CommentDocument> {
  const db = getFirestore();
  const docRef = db.collection("novels").doc(novelId).collection("comments").doc(commentId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new NotFoundError("Comment not found");
  }

  await docRef.update({
    likes: admin.firestore.FieldValue.increment(1),
  });

  const updated = await docRef.get();
  const updatedData = updated.data();
  if (!updatedData) {
    throw new NotFoundError("Comment not found");
  }
  return commentDocToData(updated.id, updatedData, novelId);
}
