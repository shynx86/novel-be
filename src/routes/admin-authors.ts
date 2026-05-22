import { Hono } from "hono";
import { dashboardAuthMiddleware } from "../middleware/dashboard-auth.js";
import {
  createAuthor,
  deleteAuthor,
  getAuthor,
  listAuthors,
  updateAuthor,
} from "../services/author.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminAuthors = new Hono();

adminAuthors.use("/*", dashboardAuthMiddleware);

adminAuthors.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listAuthors({ page, limit, search });
  return c.json({ data: result }, 200);
});

adminAuthors.get("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");
  const author = await getAuthor(authorId);
  return c.json({ data: author }, 200);
});

adminAuthors.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", { field: "name" });
  }

  const author = await createAuthor({
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: author }, 201);
});

adminAuthors.patch("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");
  const body = await c.req.json();

  const author = await updateAuthor(authorId, {
    name: body.name,
    slug: body.slug,
    bio: body.bio,
    avatar_url: body.avatar_url,
  });
  return c.json({ data: author }, 200);
});

adminAuthors.delete("/:authorId", async (c) => {
  const authorId = c.req.param("authorId");
  await deleteAuthor(authorId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminAuthors };
