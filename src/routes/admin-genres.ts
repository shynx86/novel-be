import { Hono } from "hono";
import { adminMiddleware } from "../middleware/admin.js";
import { authMiddleware } from "../middleware/auth.js";
import { createGenre, deleteGenre, listGenresAdmin, updateGenre } from "../services/genre-admin.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminGenres = new Hono();

adminGenres.use("/*", authMiddleware, adminMiddleware);

adminGenres.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const result = await listGenresAdmin(page, limit);
  return c.json({ data: result }, 200);
});

adminGenres.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", { field: "name" });
  }

  const genre = await createGenre({ name: body.name, slug: body.slug });
  return c.json({ data: genre }, 201);
});

adminGenres.patch("/:genreId", async (c) => {
  const genreId = c.req.param("genreId");
  const body = await c.req.json();
  const genre = await updateGenre(genreId, { name: body.name, slug: body.slug });
  return c.json({ data: genre }, 200);
});

adminGenres.delete("/:genreId", async (c) => {
  const genreId = c.req.param("genreId");
  await deleteGenre(genreId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminGenres };
