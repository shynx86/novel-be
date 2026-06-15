import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { getFirestore } from "../services/firebase.js";
import { getNovelsByTranslator } from "../services/novel-relation.js";
import { enrichNovelWithRelations, getNovel } from "../services/novel.js";
import {
  createTranslator,
  deleteTranslator,
  getTranslator,
  listTranslators,
  updateTranslator,
} from "../services/translator.js";
import { ConflictError, ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminTranslators = new Hono();

adminTranslators.use("/*", authMiddleware, adminMiddleware);

adminTranslators.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listTranslators({ page, limit, search });
  return c.json({ data: result }, 200);
});

// GET /api/admin/translators/:translatorId/novels — must be before /:translatorId
adminTranslators.get("/:translatorId/novels", async (c) => {
  const translatorId = c.req.param("translatorId");
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);

  const result = await getNovelsByTranslator(translatorId, { page, limit });
  const novels = await Promise.all(
    result.items.map(async (novelId) => {
      const novel = await getNovel(novelId);
      return enrichNovelWithRelations(novel);
    }),
  );

  return c.json({ data: { ...result, items: novels } }, 200);
});

adminTranslators.get("/:translatorId", async (c) => {
  const translatorId = c.req.param("translatorId");
  const translator = await getTranslator(translatorId);
  return c.json({ data: translator }, 200);
});

adminTranslators.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", { field: "name" });
  }

  const translator = await createTranslator({
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: translator }, 201);
});

adminTranslators.patch("/:translatorId", async (c) => {
  const translatorId = c.req.param("translatorId");
  const body = await c.req.json();

  const translator = await updateTranslator(translatorId, {
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: translator }, 200);
});

adminTranslators.delete("/:translatorId", async (c) => {
  const translatorId = c.req.param("translatorId");

  // Check for linked novels
  const db = getFirestore();
  const linkedNovels = await db
    .collection("novel_translators")
    .where("translator_id", "==", translatorId)
    .limit(1)
    .get();

  if (!linkedNovels.empty) {
    throw new ConflictError("Cannot delete translator with linked novels", {
      linked_novel_count: linkedNovels.size,
    });
  }

  await deleteTranslator(translatorId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminTranslators };
