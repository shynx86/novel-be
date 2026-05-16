import { Hono } from "hono";
import { listGenres } from "../services/genre.js";

const genres = new Hono();

// GET /api/genres
genres.get("/", async (c) => {
  const result = await listGenres();
  return c.json({ data: result }, 200);
});

export { genres };
