import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import {
  getUserProfile,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
} from "../services/auth.js";
import { ValidationError } from "../utils/errors.js";

type Variables = {
  user: unknown;
  userId: string;
};

const auth = new Hono<{ Variables: Variables }>();

// POST /api/auth/register
auth.post("/register", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; display_name?: string }>();

  if (!body.email || typeof body.email !== "string" || !body.email.includes("@")) {
    throw new ValidationError("Valid email is required", { field: "email" });
  }

  if (!body.password || typeof body.password !== "string" || body.password.length < 6) {
    throw new ValidationError("Password must be at least 6 characters", {
      field: "password",
    });
  }

  if (body.display_name !== undefined && typeof body.display_name !== "string") {
    throw new ValidationError("display_name must be a string", {
      field: "display_name",
    });
  }

  const result = await registerWithEmail(body.email, body.password, body.display_name);

  return c.json({ data: result }, 201);
});

// POST /api/auth/login
auth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();

  if (!body.email || typeof body.email !== "string") {
    throw new ValidationError("Email is required", { field: "email" });
  }

  if (!body.password || typeof body.password !== "string") {
    throw new ValidationError("Password is required", { field: "password" });
  }

  const result = await loginWithEmail(body.email, body.password);

  return c.json({ data: result }, 200);
});

// POST /api/auth/google
auth.post("/google", async (c) => {
  const body = await c.req.json<{ id_token?: string }>();

  if (!body.id_token || typeof body.id_token !== "string") {
    throw new ValidationError("id_token is required", { field: "id_token" });
  }

  const result = await loginWithGoogle(body.id_token);

  const status = result.isNewUser ? 201 : 200;
  const { isNewUser, ...data } = result;

  return c.json({ data }, status);
});

// GET /api/auth/me (protected)
auth.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await getUserProfile(userId);
  return c.json({ data: user }, 200);
});

export { auth };
