import { Hono } from "hono";
import { searchNovels } from "../services/search.js";
import { parsePagination } from "../utils/pagination.js";

const search = new Hono();

// GET /api/search
search.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const q = c.req.query("q");
  const status = c.req.query("status");

  const result = await searchNovels({ q, status, page, limit });
  return c.json({ data: result }, 200);
});

export { search };
