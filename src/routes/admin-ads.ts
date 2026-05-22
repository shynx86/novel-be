import { Hono } from "hono";
import { dashboardAuthMiddleware } from "../middleware/dashboard-auth.js";
import { createAd, deleteAd, getAd, listAds, updateAd } from "../services/ad.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

const adminAds = new Hono();

adminAds.use("/*", dashboardAuthMiddleware);

adminAds.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const result = await listAds({ page, limit });
  return c.json({ data: result }, 200);
});

adminAds.get("/:adId", async (c) => {
  const adId = c.req.param("adId");
  const ad = await getAd(adId);
  return c.json({ data: ad }, 200);
});

adminAds.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.title || typeof body.title !== "string") {
    throw new ValidationError("title is required", { field: "title" });
  }
  if (!body.image_url || typeof body.image_url !== "string") {
    throw new ValidationError("image_url is required", { field: "image_url" });
  }
  if (!body.link_url || typeof body.link_url !== "string") {
    throw new ValidationError("link_url is required", { field: "link_url" });
  }
  if (!body.position || !["header", "sidebar", "footer", "inline"].includes(body.position)) {
    throw new ValidationError("position must be one of: header, sidebar, footer, inline", {
      field: "position",
    });
  }

  const ad = await createAd({
    title: body.title,
    image_url: body.image_url,
    link_url: body.link_url,
    position: body.position,
    is_active: body.is_active,
    display_order: body.display_order,
    start_date: body.start_date,
    end_date: body.end_date,
  });
  return c.json({ data: ad }, 201);
});

adminAds.patch("/:adId", async (c) => {
  const adId = c.req.param("adId");
  const body = await c.req.json();

  if (
    body.position !== undefined &&
    !["header", "sidebar", "footer", "inline"].includes(body.position)
  ) {
    throw new ValidationError("position must be one of: header, sidebar, footer, inline", {
      field: "position",
    });
  }

  const ad = await updateAd(adId, {
    title: body.title,
    image_url: body.image_url,
    link_url: body.link_url,
    position: body.position,
    is_active: body.is_active,
    display_order: body.display_order,
    start_date: body.start_date,
    end_date: body.end_date,
  });
  return c.json({ data: ad }, 200);
});

adminAds.delete("/:adId", async (c) => {
  const adId = c.req.param("adId");
  await deleteAd(adId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminAds };
