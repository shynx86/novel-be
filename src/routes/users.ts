import { Hono } from "hono";
import { listPublicNovels } from "../services/novel.js";
import { getPublicUserProfile, getTranslatorStats } from "../services/profile.js";
import { parsePagination } from "../utils/pagination.js";

const users = new Hono();

users.get("/:username/profile", async (c) => {
  const profile = await getPublicUserProfile(c.req.param("username"));
  const publicStats = await getTranslatorStats(profile.uid, { publicOnly: true });
  const translatorStats = publicStats.novel_count > 0 ? publicStats : null;
  return c.json({ data: { ...profile, translator_stats: translatorStats } }, 200);
});

users.get("/:username/novels", async (c) => {
  const profile = await getPublicUserProfile(c.req.param("username"));
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 12);
  const result = await listPublicNovels({
    translator_id: profile.uid,
    page,
    limit,
  });
  return c.json({ data: result }, 200);
});

export { users };
