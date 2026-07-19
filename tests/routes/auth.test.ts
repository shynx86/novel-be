import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCreateCustomToken,
  mockCreateUser,
  mockDocGet,
  mockDocSet,
  mockVerifyIdToken,
} from "../__mocks__/firebase-admin.js";

const mockUserRecord = {
  uid: "uid-123",
  email: "test@test.com",
  displayName: "Test User",
};

const mockUserDoc = {
  uid: "uid-123",
  email: "test@test.com",
  display_name: "Test User",
  avatar_url: "",
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const mockCustomToken = "mock-custom-token";
const mockIdToken = "mock-id-token";
const mockRefreshToken = "mock-refresh-token";

function mockExchangeFetch(): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        idToken: mockIdToken,
        refreshToken: mockRefreshToken,
      }),
    })) as unknown as typeof fetch;
}

function mockLoginFetch(): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        localId: "uid-123",
        email: "test@test.com",
        idToken: mockIdToken,
        refreshToken: mockRefreshToken,
      }),
    })) as unknown as typeof fetch;
}

function setupMocksForSuccessfulRegistration() {
  mockCreateUser.mockResolvedValue(mockUserRecord);
  mockDocSet.mockResolvedValue(undefined);
  mockCreateCustomToken.mockResolvedValue(mockCustomToken);
}

function setupMocksForExistingUser() {
  mockDocGet.mockResolvedValue({
    exists: true,
    data: () => mockUserDoc,
  });
}

let originalFetch: typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── POST /api/auth/register ─────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("returns 201 with an id token and an HttpOnly refresh cookie on success", async () => {
    setupMocksForSuccessfulRegistration();
    globalThis.fetch = mockExchangeFetch();

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@test.com",
        password: "123456",
        display_name: "Test User",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveProperty("user");
    expect(body.data).toHaveProperty("idToken", mockIdToken);
    expect(body.data).not.toHaveProperty("refreshToken");
    expect(res.headers.get("set-cookie")).toContain(`novel_refresh=${mockRefreshToken}`);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(body.data.user.email).toBe("test@test.com");
    expect(body.data.user.display_name).toBe("Test User");
  });

  it("returns 201 with user_{uid} as display_name when not provided", async () => {
    setupMocksForSuccessfulRegistration();
    globalThis.fetch = mockExchangeFetch();

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "123456" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.user.display_name).toBe("user_uid-123");
  });

  it("returns 400 when email is missing", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "123456" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is too short", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "12345" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when email is already registered", async () => {
    const error = new Error("email-already-exists") as Error & { code: string };
    error.code = "auth/email-already-exists";
    mockCreateUser.mockRejectedValue(error);
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@test.com",
        password: "123456",
        display_name: "Test",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ─── POST /api/auth/login ────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);
  });

  it("returns 200 with user, idToken and an HttpOnly refresh cookie on valid credentials", async () => {
    setupMocksForExistingUser();
    globalThis.fetch = mockLoginFetch();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "123456" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.email).toBe("test@test.com");
    expect(body.data.idToken).toBe(mockIdToken);
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain(`novel_refresh=${mockRefreshToken}`);
  });

  it("returns 401 when credentials are invalid", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }),
      })) as unknown as typeof fetch;

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "wrong" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when email is missing", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "123456" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com" }),
    });

    expect(res.status).toBe(400);
  });

  it("auto-creates Firestore doc when Auth user exists but doc doesn't", async () => {
    // First get: doc doesn't exist → triggers create
    // Second get: re-fetch after set with merge
    mockDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockUserDoc }) });
    mockDocSet.mockResolvedValue(undefined);
    globalThis.fetch = mockLoginFetch();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "123456" }),
    });

    expect(res.status).toBe(200);
    expect(mockDocSet).toHaveBeenCalled();
  });
});

// ─── POST /api/auth/google ───────────────────────────────────────────

describe("POST /api/auth/google", () => {
  const mockDecodedToken = {
    uid: "google-uid-456",
    email: "user@gmail.com",
    name: "Jane Smith",
    picture: "https://lh3.googleusercontent.com/avatar",
  };

  beforeEach(() => {
    mockVerifyIdToken.mockResolvedValue(mockDecodedToken);
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);
    globalThis.fetch = mockExchangeFetch();
  });

  it("returns 200 with user, idToken and an HttpOnly refresh cookie for an existing user", async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ...mockUserDoc,
        uid: "google-uid-456",
        email: "user@gmail.com",
        display_name: "Jane Smith",
        avatar_url: "https://lh3.googleusercontent.com/avatar",
      }),
    });

    const res = await app.request("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: "valid-google-id-token" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.display_name).toBe("Jane Smith");
    expect(body.data.idToken).toBe(mockIdToken);
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain(`novel_refresh=${mockRefreshToken}`);
  });

  it("returns 201 for new user (auto-register)", async () => {
    const googleUserDoc = {
      ...mockUserDoc,
      uid: "google-uid-456",
      email: "user@gmail.com",
      display_name: "Jane Smith",
      avatar_url: "https://lh3.googleusercontent.com/avatar",
    };
    mockDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined }) // isNewUser check
      .mockResolvedValueOnce({ exists: false, data: () => undefined }) // getOrCreate check
      .mockResolvedValueOnce({ exists: true, data: () => googleUserDoc }); // re-fetch after merge
    mockDocSet.mockResolvedValue(undefined);

    const res = await app.request("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: "valid-google-id-token" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.user.display_name).toBe("Jane Smith");
    expect(mockDocSet).toHaveBeenCalled();
  });

  it("returns 401 when id_token is invalid", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    const res = await app.request("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: "invalid-token" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when id_token is missing", async () => {
    const res = await app.request("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("populates avatar_url from Google profile picture", async () => {
    const googleUserDoc = {
      ...mockUserDoc,
      uid: "google-uid-456",
      email: "user@gmail.com",
      display_name: "Jane Smith",
      avatar_url: "https://lh3.googleusercontent.com/avatar",
    };
    mockDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined }) // isNewUser check
      .mockResolvedValueOnce({ exists: false, data: () => undefined }) // getOrCreate check
      .mockResolvedValueOnce({ exists: true, data: () => googleUserDoc }); // re-fetch after merge
    mockDocSet.mockResolvedValue(undefined);

    const res = await app.request("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: "valid-google-id-token" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.user.avatar_url).toBe("https://lh3.googleusercontent.com/avatar");
  });
});

// ─── POST /api/auth/refresh ──────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  it("returns 200 with a new idToken and rotates the refresh cookie", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          id_token: "new-id-token",
          refresh_token: "new-refresh-token",
        }),
      })) as unknown as typeof fetch;

    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: "novel_refresh=valid-refresh-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.idToken).toBe("new-id-token");
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain("novel_refresh=new-refresh-token");
  });

  it("returns 401 when the refresh cookie is invalid", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: "INVALID_REFRESH_TOKEN" } }),
      })) as unknown as typeof fetch;

    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: "novel_refresh=invalid-token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when the refresh cookie is missing", async () => {
    const res = await app.request("/api/auth/refresh", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when the refresh cookie is expired", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: "TOKEN_EXPIRED" } }),
      })) as unknown as typeof fetch;

    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: "novel_refresh=expired-token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    const res = await app.request("/api/auth/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });

    expect(res.status).toBe(401);
  });

  it("returns 200 with user profile when valid token", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-123" });
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockUserDoc });

    const res = await app.request("/api/auth/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.uid).toBe("uid-123");
    expect(body.data.email).toBe("test@test.com");
  });

  it("returns 404 when user profile not found in Firestore", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-123" });
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await app.request("/api/auth/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(404);
  });
});
