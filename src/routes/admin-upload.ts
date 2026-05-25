import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { getAdminApp } from "../services/firebase.js";
import { ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const adminUpload = new Hono();

adminUpload.use("/*", authMiddleware, adminMiddleware);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FOLDERS = ["cover_imgs", "author_imgs", "translator_imgs"] as const;
const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// POST /api/admin/upload/signed-url — generate a presigned write URL
adminUpload.post("/signed-url", async (c) => {
  const body = await c.req.json();
  const { filename, contentType, folder } = body as {
    filename?: string;
    contentType?: string;
    folder?: string;
  };

  if (!filename || typeof filename !== "string") {
    throw new ValidationError("filename is required", { field: "filename" });
  }
  if (!contentType || typeof contentType !== "string") {
    throw new ValidationError("contentType is required", { field: "contentType" });
  }
  if (!folder || !ALLOWED_FOLDERS.includes(folder as (typeof ALLOWED_FOLDERS)[number])) {
    throw new ValidationError(`folder is required and must be one of: ${ALLOWED_FOLDERS.join(", ")}`, {
      field: "folder",
    });
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new ValidationError("File must be an image (JPEG, PNG, WebP, GIF)", {
      field: "contentType",
    });
  }

  const ext = filename.split(".").pop() || "jpg";
  const filePath = `${folder}/${randomUUID()}.${ext}`;

  let bucket;
  try {
    bucket = getAdminApp().storage().bucket();
  } catch (e) {
    logger.error("Failed to get storage bucket", { error: String(e) });
    throw new ValidationError("Storage not configured");
  }

  let signedUrl: string;
  try {
    const [url] = await bucket.file(filePath).getSignedUrl({
      action: "write",
      contentType,
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    });
    signedUrl = url;
  } catch (e) {
    logger.error("Failed to generate signed URL", { error: String(e), filePath });
    throw new ValidationError("Failed to generate upload URL");
  }

  logger.info("Signed upload URL generated", { filePath, contentType });

  return c.json({ data: { signedUrl, path: filePath } }, 200);
});

// POST /api/admin/upload/confirm — validate file exists and return read URL
adminUpload.post("/confirm", async (c) => {
  const body = await c.req.json();
  const { path: filePath, contentType } = body as { path?: string; contentType?: string };

  if (!filePath || typeof filePath !== "string") {
    throw new ValidationError("path is required", { field: "path" });
  }

  // Basic path validation — must start with an allowed folder and not contain traversal
  const isValidFolder = ALLOWED_FOLDERS.some((f) => filePath.startsWith(`${f}/`));
  if (!isValidFolder || filePath.includes("..")) {
    throw new ValidationError("Invalid file path");
  }

  let bucket;
  try {
    bucket = getAdminApp().storage().bucket();
  } catch (e) {
    logger.error("Failed to get storage bucket", { error: String(e) });
    throw new ValidationError("Storage not configured");
  }

  const file = bucket.file(filePath);

  // Check file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new ValidationError("File not found — upload may have failed");
  }

  // Get metadata to verify content type if provided
  const [metadata] = await file.getMetadata();
  const detectedType = metadata.contentType;
  if (contentType && detectedType !== contentType) {
    logger.warn("Content type mismatch", { expected: contentType, actual: detectedType });
  }

  // Generate a long-lived read URL
  let readUrl: string;
  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "2036-01-01",
    });
    readUrl = url;
  } catch (e) {
    logger.error("Failed to generate read URL", { error: String(e), filePath });
    throw new ValidationError("Failed to generate download URL");
  }

  logger.info("Upload confirmed", { filePath, size: metadata.size });

  return c.json({ data: { url: readUrl, path: filePath } }, 200);
});

export { adminUpload };
