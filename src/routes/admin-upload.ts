import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { getAdminApp } from "../services/firebase.js";
import { ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const adminUpload = new Hono();

adminUpload.use("/*", authMiddleware, adminMiddleware);

// POST /api/admin/upload
adminUpload.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    throw new ValidationError("file is required", { field: "file" });
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError("File must be an image (JPEG, PNG, WebP, GIF)", {
      field: "file",
    });
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new ValidationError("File size must be less than 5MB", { field: "file" });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const filePath = `uploads/${timestamp}-${randomStr}.${ext}`;

  let buffer: Buffer;
  try {
    const arrayBuf = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
  } catch (e) {
    logger.error("Failed to read file buffer", { error: String(e) });
    throw new ValidationError("Failed to read file data");
  }

  let bucket;
  try {
    bucket = getAdminApp().storage().bucket();
  } catch (e) {
    logger.error("Failed to get storage bucket", { error: String(e) });
    throw new ValidationError("Storage not configured");
  }

  try {
    await bucket.file(filePath).save(buffer, {
      metadata: { contentType: file.type },
    });
  } catch (e) {
    logger.error("Failed to save file to storage", { error: String(e), filePath });
    throw new ValidationError("Failed to save file to storage");
  }

  let signedUrl: string;
  try {
    const [url] = await bucket.file(filePath).getSignedUrl({
      action: "read",
      expires: "2036-01-01",
    });
    signedUrl = url;
  } catch (e) {
    logger.error("Failed to generate signed URL", { error: String(e), filePath });
    throw new ValidationError("Failed to generate download URL");
  }

  logger.info("File uploaded", { filePath, size: file.size });

  return c.json({ data: { url: signedUrl, path: filePath } }, 201);
});

export { adminUpload };
