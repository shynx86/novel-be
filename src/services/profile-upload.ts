import { randomUUID } from "node:crypto";
import { ValidationError } from "../utils/errors.js";
import { getAdminApp } from "./firebase.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000;

function validateContentType(contentType: string): void {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new ValidationError("Ảnh đại diện phải là JPEG, PNG hoặc WebP", {
      field: "contentType",
    });
  }
}

export async function createAvatarUploadUrl(
  userId: string,
  filename: string,
  contentType: string,
): Promise<{ signedUrl: string; path: string }> {
  validateContentType(contentType);
  const rawExtension = filename.split(".").pop()?.toLowerCase() || "jpg";
  const extension = /^[a-z0-9]+$/.test(rawExtension) ? rawExtension : "jpg";
  const path = `avatars/${userId}/${randomUUID()}.${extension}`;
  const bucket = getAdminApp().storage().bucket();
  const [signedUrl] = await bucket.file(path).getSignedUrl({
    action: "write",
    contentType,
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
  });
  return { signedUrl, path };
}

export async function confirmAvatarUpload(
  userId: string,
  path: string,
  contentType?: string,
): Promise<{ url: string; path: string }> {
  if (!path.startsWith(`avatars/${userId}/`) || path.includes("..")) {
    throw new ValidationError("Đường dẫn ảnh đại diện không hợp lệ");
  }
  if (contentType) validateContentType(contentType);

  const bucket = getAdminApp().storage().bucket();
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) throw new ValidationError("Không tìm thấy ảnh vừa tải lên");

  const [metadata] = await file.getMetadata();
  if (Number(metadata.size || 0) > 5 * 1024 * 1024) {
    await file.delete().catch(() => undefined);
    throw new ValidationError("Ảnh đại diện không được vượt quá 5MB");
  }
  if (metadata.contentType && !ALLOWED_TYPES.has(metadata.contentType)) {
    await file.delete().catch(() => undefined);
    throw new ValidationError("Định dạng ảnh đại diện không hợp lệ");
  }

  const [url] = await file.getSignedUrl({ action: "read", expires: "2036-01-01" });
  return { url, path };
}
