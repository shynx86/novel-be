import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { loadActorMiddleware } from "../middleware/authorization.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  changePassword,
  getUserProfile,
  loginWithEmail,
  loginWithGoogle,
  refreshIdToken,
  registerWithEmail,
  revokeUserSessions,
  updateUserProfile,
} from "../services/auth.js";
import { getAuth } from "../services/firebase.js";
import { confirmAvatarUpload, createAvatarUploadUrl } from "../services/profile-upload.js";
import { getTranslatorStats } from "../services/profile.js";
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
  let emailVerified = false;
  let authProviders: string[] = [];
  try {
    const authUser = await getAuth().getUser(userId);
    emailVerified = authUser.emailVerified;
    authProviders = authUser.providerData.map((provider) => provider.providerId);
  } catch {
    // Firestore profile remains available if provider metadata cannot be loaded.
  }
  return c.json(
    { data: { ...user, email_verified: emailVerified, auth_providers: authProviders } },
    200,
  );
});

// PATCH /api/auth/me (protected)
auth.patch("/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<{
    display_name?: string;
    avatar_url?: string;
    username?: string;
    bio?: string;
  }>();

  const user = await updateUserProfile(userId, body);
  return c.json({ data: user }, 200);
});

auth.get("/me/translator-stats", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await getUserProfile(userId);
  if (user.role !== "translator" && user.role !== "admin") {
    return c.json({ data: null }, 200);
  }
  return c.json({ data: await getTranslatorStats(userId) }, 200);
});

auth.post("/me/change-password", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await getUserProfile(userId);
  const body = await c.req.json<{ current_password?: string; new_password?: string }>();
  if (!body.current_password || !body.new_password) {
    throw new ValidationError("Mật khẩu hiện tại và mật khẩu mới là bắt buộc");
  }
  await changePassword(userId, user.email, body.current_password, body.new_password);
  return c.json({ data: { success: true } }, 200);
});

auth.post("/me/revoke-sessions", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  await revokeUserSessions(userId);
  return c.json({ data: { success: true } }, 200);
});

auth.post("/me/avatar/signed-url", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<{ filename?: string; contentType?: string }>();
  if (!body.filename || !body.contentType) {
    throw new ValidationError("Tên tệp và định dạng ảnh là bắt buộc");
  }
  return c.json(
    { data: await createAvatarUploadUrl(userId, body.filename, body.contentType) },
    200,
  );
});

auth.post("/me/avatar/confirm", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<{ path?: string; contentType?: string }>();
  if (!body.path) throw new ValidationError("Đường dẫn ảnh là bắt buộc");
  return c.json({ data: await confirmAvatarUpload(userId, body.path, body.contentType) }, 200);
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
