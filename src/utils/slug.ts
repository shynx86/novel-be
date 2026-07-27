import { ValidationError } from "./errors.js";

/** Convert Vietnamese text to a stable, URL-safe ASCII slug. */
export function toVietnameseSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function requireVietnameseSlug(value: unknown, field = "slug"): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, { field });
  }
  const slug = toVietnameseSlug(value);
  if (!slug) {
    throw new ValidationError(`${field} must contain at least one letter or number`, { field });
  }
  return slug;
}

export function assertImmutableSlug(currentId: string, requestedSlug: unknown): void {
  const slug = requireVietnameseSlug(requestedSlug);
  if (slug !== currentId) {
    throw new ValidationError("slug cannot be changed after creation", { field: "slug" });
  }
}
