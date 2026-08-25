import { Hono } from "hono";
import { rateLimit } from "../middleware/rate-limit.js";
import { getSearchOptions, searchNovels } from "../services/search.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const search = new Hono();

function optionalText(value: string | undefined, field: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 100) {
    throw new ValidationError(`${field} must be 100 characters or fewer`, { field });
  }
  return trimmed;
}

search.get("/options", async (c) => {
  const options = await getSearchOptions();
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json({ data: options }, 200);
});

search.get(
  "/",
  rateLimit({ namespace: "novel-search", limit: 30, windowMs: 60_000 }),
  async (c) => {
    const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
    const params = {
      title: optionalText(c.req.query("title") || c.req.query("q"), "title"),
      author: optionalText(c.req.query("author"), "author"),
      genreId: optionalText(c.req.query("genre"), "genre"),
      translatorId: optionalText(c.req.query("translator"), "translator"),
      page,
      limit: Math.min(limit, 30),
    };

    if (!params.title && !params.author && !params.genreId && !params.translatorId) {
      throw new ValidationError("Choose at least one search criterion");
    }

    const result = await searchNovels(params);
    return c.json({ data: result }, 200);
  },
);

export { search };
