import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  createTranslator,
  deleteTranslator,
  getTranslator,
  listTranslators,
  updateTranslator,
} from "../services/translator.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminTranslators = new Hono();

adminTranslators.use("/*", authMiddleware, adminMiddleware);

adminTranslators.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listTranslators({ page, limit, search });
  return c.json({ data: result }, 200);
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
  await deleteTranslator(translatorId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminTranslators };
