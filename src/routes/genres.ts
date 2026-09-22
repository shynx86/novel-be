import { Hono } from "hono";
import { GENRES_CACHE_CONTROL } from "../config/cache.js";
import { getGenreBySlug, listGenres } from "../services/genre.js";
import { NotFoundError } from "../utils/errors.js";

const genres = new Hono();

// GET /api/genres
genres.get("/", async (c) => {
  const result = await listGenres();
  c.header("Cache-Control", GENRES_CACHE_CONTROL);
  return c.json({ data: result }, 200);
});

// GET /api/genres/:slug
genres.get("/:slug", async (c) => {
  const genre = await getGenreBySlug(c.req.param("slug"));
  if (!genre) throw new NotFoundError("Genre not found");
  c.header("Cache-Control", GENRES_CACHE_CONTROL);
  return c.json({ data: genre }, 200);
});

export { genres };
