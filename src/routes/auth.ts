import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { loadActorMiddleware } from "../middleware/authorization.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  getUserProfile,
  loginWithEmail,
  loginWithGoogle,
  refreshIdToken,
  registerWithEmail,
  updateUserProfile,
} from "../services/auth.js";
import type { Actor } from "../types/auth.js";
import { ValidationError } from "../utils/errors.js";

type Variables = {
  user: unknown;
  userId: string;
  actor: Actor;
};

const auth = new Hono<{ Variables: Variables }>();

auth.use("/register", rateLimit({ namespace: "auth-register", limit: 5, windowMs: 60_000 }));
auth.use("/login", rateLimit({ namespace: "auth-login", limit: 10, windowMs: 60_000 }));
auth.use("/google", rateLimit({ namespace: "auth-google", limit: 10, windowMs: 60_000 }));
auth.use("/refresh", rateLimit({ namespace: "auth-refresh", limit: 20, windowMs: 60_000 }));

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

// POST /api/auth/refresh
auth.post("/refresh", async (c) => {
  const body = await c.req
    .json<{ refresh_token?: string }>()
    .catch((): { refresh_token?: string } => ({}));
  if (!body.refresh_token || typeof body.refresh_token !== "string") {
    throw new ValidationError("refresh_token is required", { field: "refresh_token" });
  }

  const data = await refreshIdToken(body.refresh_token);

  return c.json({ data }, 200);
});

// GET /api/auth/me (protected)
auth.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await getUserProfile(userId);
  return c.json({ data: user }, 200);
});

// PATCH /api/auth/me (protected)
auth.patch("/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<{ display_name?: string; avatar_url?: string }>();

  const user = await updateUserProfile(userId, body);
  return c.json({ data: user }, 200);
});

// GET /api/auth/capabilities (protected)
auth.get("/capabilities", authMiddleware, loadActorMiddleware, (c) => {
  const actor = c.get("actor");
  return c.json(
    {
      data: {
        role: actor.role,
        permissions: Array.from(actor.permissions),
      },
    },
    200,
  );
});

export { auth };
