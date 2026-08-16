import { Hono } from "hono";
import type { Permission } from "../config/permissions.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  actorHasPermission,
  assertAnyPermission,
  assertOwnedPermission,
  loadActorMiddleware,
  requirePermission,
} from "../middleware/authorization.js";
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  updateChapter,
} from "../services/chapter.js";
import { setNovelAuthors, setNovelGenres } from "../services/novel-relation.js";
import {
  createNovel,
  deleteNovel,
  enrichNovelWithRelations,
  getNovel,
  listNovels,
  updateNovel,
} from "../services/novel.js";
import type { Actor } from "../types/auth.js";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";
import { assertImmutableSlug } from "../utils/slug.js";

type Variables = {
  user: unknown;
  userId: string;
  actor: Actor;
};

const adminNovels = new Hono<{ Variables: Variables }>();

adminNovels.use("/*", authMiddleware, loadActorMiddleware, requirePermission("admin.access"));

async function assertNovelScope(
  actor: Actor,
  novelId: string,
  ownPermission: Permission,
  anyPermission: Permission,
): Promise<void> {
  if (actorHasPermission(actor, anyPermission)) return;
  const novel = await getNovel(novelId);
  assertOwnedPermission(actor, novel.translator_id, ownPermission, anyPermission);
}

// POST /api/admin/novels
adminNovels.post("/", requirePermission("novels.create"), async (c) => {
  const body = await c.req.json();
  const actor = c.get("actor");

  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }
  if (body.slug !== undefined && typeof body.slug !== "string") {
    throw new ValidationError("slug must be a string", { field: "slug" });
  }
  if (
    body.publication_status !== undefined &&
    body.publication_status !== "draft" &&
    body.publication_status !== "public"
  ) {
    throw new ValidationError("publication_status must be draft or public", {
      field: "publication_status",
    });
  }

  if (body.publication_status !== undefined && !actorHasPermission(actor, "novels.publish")) {
    throw new ForbiddenError("Permission required", { permission: "novels.publish" });
  }

  const canAssignTranslator = actorHasPermission(actor, "novels.assign_translator");
  const translatorId = canAssignTranslator ? body.translator_id : actor.userId;

  const novel = await createNovel({
    slug: body.slug || body.title,
    title: body.title,
    description: body.description,
    cover_url: body.cover_url,
    status: body.status,
    publication_status: actorHasPermission(actor, "novels.publish")
      ? body.publication_status
      : undefined,
    price: body.price,
    translator_id: translatorId,
  });

  // Set relations if provided
  if (Array.isArray(body.author_ids)) {
    await setNovelAuthors(novel.id, body.author_ids);
  }
  if (Array.isArray(body.genre_ids)) {
    await setNovelGenres(novel.id, body.genre_ids);
  }

  return c.json({ data: novel }, 201);
});

// GET /api/admin/novels
adminNovels.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const status = c.req.query("status");
  const publicationStatus = c.req.query("publication_status");
  const search = c.req.query("search");
  const sortBy = c.req.query("sort_by") as
    | "created_at"
    | "updated_at"
    | "title"
    | "views"
    | "rating"
    | undefined;
  const sortOrder = c.req.query("sort_order") as "asc" | "desc" | undefined;
  const actor = c.get("actor");
  assertAnyPermission(actor, ["novels.view.own", "novels.view.any"]);

  const translatorId = actorHasPermission(actor, "novels.view.any") ? undefined : actor.userId;

  const result = await listNovels({
    page,
    limit,
    status,
    publication_status: publicationStatus,
    search,
    translator_id: translatorId,
    sort_by: sortBy,
    sort_order: sortOrder,
  });
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId
adminNovels.get("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const actor = c.get("actor");

  const novel = await getNovel(novelId);
  assertOwnedPermission(actor, novel.translator_id, "novels.view.own", "novels.view.any");

  const enriched = await enrichNovelWithRelations(novel);
  return c.json({ data: enriched }, 200);
});

// PATCH /api/admin/novels/:novelId
adminNovels.patch("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();
  const actor = c.get("actor");

  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") {
      throw new ValidationError("slug must be a string", { field: "slug" });
    }
    assertImmutableSlug(novelId, body.slug);
  }

  await assertNovelScope(actor, novelId, "novels.update.own", "novels.update.any");

  if (
    body.publication_status !== undefined &&
    body.publication_status !== "draft" &&
    body.publication_status !== "public"
  ) {
    throw new ValidationError("publication_status must be draft or public", {
      field: "publication_status",
    });
  }

  if (body.publication_status !== undefined && !actorHasPermission(actor, "novels.publish")) {
    throw new ForbiddenError("Permission required", { permission: "novels.publish" });
  }
  if (body.translator_id !== undefined && !actorHasPermission(actor, "novels.assign_translator")) {
    throw new ForbiddenError("Permission required", {
      permission: "novels.assign_translator",
    });
  }

  const updateData: Record<string, unknown> = {
    title: body.title,
    description: body.description,
    cover_url: body.cover_url,
    status: body.status,
    // Publication is an admin-only decision; translators can prepare drafts.
    ...(actorHasPermission(actor, "novels.publish") && body.publication_status !== undefined
      ? { publication_status: body.publication_status }
      : {}),
    price: body.price,
  };

  if (actorHasPermission(actor, "novels.assign_translator") && body.translator_id !== undefined) {
    updateData.translator_id = body.translator_id || null;
  }

  const novel = await updateNovel(novelId, updateData);

  // Update relations if provided
  if (Array.isArray(body.author_ids)) {
    await setNovelAuthors(novelId, body.author_ids);
  }
  if (Array.isArray(body.genre_ids)) {
    await setNovelGenres(novelId, body.genre_ids);
  }

  return c.json({ data: novel }, 200);
});

// DELETE /api/admin/novels/:novelId
adminNovels.delete("/:novelId", async (c) => {
  const novelId = c.req.param("novelId");
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "novels.delete.own", "novels.delete.any");

  await deleteNovel(novelId);
  return c.json({ data: { deleted: true } }, 200);
});

// PATCH /api/admin/novels/:novelId/featured
adminNovels.patch("/:novelId/featured", requirePermission("novels.feature"), async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();

  if (typeof body.is_featured !== "boolean") {
    throw new ValidationError("is_featured must be a boolean", { field: "is_featured" });
  }

  const novel = await updateNovel(novelId, { is_featured: body.is_featured });
  return c.json({ data: novel }, 200);
});

// Chapter routes

// POST /api/admin/novels/:novelId/chapters
adminNovels.post("/:novelId/chapters", async (c) => {
  const novelId = c.req.param("novelId");
  const body = await c.req.json();
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "chapters.manage.own", "chapters.manage.any");

  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }
  if (!body.content || typeof body.content !== "string") {
    throw new ValidationError("content is required", { field: "content" });
  }
  if (body.access_type !== undefined && !["free", "free_auth", "paid"].includes(body.access_type)) {
    throw new ValidationError("access_type must be one of: free, free_auth, paid", {
      field: "access_type",
    });
  }

  const chapter = await createChapter(novelId, {
    title: body.title,
    content: body.content,
    access_type: body.access_type,
    price: body.price,
  });

  return c.json({ data: chapter }, 201);
});

// GET /api/admin/novels/:novelId/chapters
adminNovels.get("/:novelId/chapters", async (c) => {
  const novelId = c.req.param("novelId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 100);
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "chapters.manage.own", "chapters.manage.any");

  const result = await listChapters(novelId, {
    page,
    limit,
    includeContent: true,
  });
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId/chapters/:index
adminNovels.get("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "chapters.manage.own", "chapters.manage.any");

  const chapter = await getChapter(novelId, index);
  return c.json({ data: chapter }, 200);
});

// PATCH /api/admin/novels/:novelId/chapters/:index
adminNovels.patch("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const body = await c.req.json();
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "chapters.manage.own", "chapters.manage.any");

  if (body.access_type !== undefined && !["free", "free_auth", "paid"].includes(body.access_type)) {
    throw new ValidationError("access_type must be one of: free, free_auth, paid", {
      field: "access_type",
    });
  }

  const chapter = await updateChapter(novelId, index, {
    title: body.title,
    content: body.content,
    access_type: body.access_type,
    price: body.price,
  });

  return c.json({ data: chapter }, 200);
});

// DELETE /api/admin/novels/:novelId/chapters/:index
adminNovels.delete("/:novelId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const index = Number(c.req.param("index"));
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "chapters.manage.own", "chapters.manage.any");

  await deleteChapter(novelId, index);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminNovels };
