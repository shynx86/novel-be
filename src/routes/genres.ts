import { Hono } from "hono";
import { getGenreBySlug, listGenres } from "../services/genre.js";
import { NotFoundError } from "../utils/errors.js";

const genres = new Hono();

// GET /api/genres
genres.get("/", async (c) => {
  const result = await listGenres();
  return c.json({ data: result }, 200);
});

// GET /api/genres/:slug
genres.get("/:slug", async (c) => {
  const genre = await getGenreBySlug(c.req.param("slug"));
  if (!genre) throw new NotFoundError("Genre not found");
  return c.json({ data: genre }, 200);
});

export { genres };
