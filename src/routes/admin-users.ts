import { Hono } from "hono";
import { dashboardAuthMiddleware } from "../middleware/dashboard-auth.js";
import { deleteUser, getUser, listUsers, updateUser } from "../services/user-admin.js";
import { parsePagination } from "../utils/pagination.js";

const adminUsers = new Hono();

adminUsers.use("/*", dashboardAuthMiddleware);

adminUsers.get("/", async (c) => {
  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const search = c.req.query("search") || undefined;

  const result = await listUsers({ page, limit, search });
  return c.json({ data: result }, 200);
});

adminUsers.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user = await getUser(userId);
  return c.json({ data: user }, 200);
});

adminUsers.patch("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const user = await updateUser(userId, {
    display_name: body.display_name,
    role: body.role,
    credits: body.credits,
  });
  return c.json({ data: user }, 200);
});

adminUsers.delete("/:userId", async (c) => {
  const userId = c.req.param("userId");
  await deleteUser(userId);
  return c.json({ data: { deleted: true } }, 200);
});

export { adminUsers };
