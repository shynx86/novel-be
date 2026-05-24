import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCollectionAdd,
  mockCountGet,
  mockDocGet,
  mockDocSet,
  mockQueryGet,
  mockVerifyIdToken,
} from "../__mocks__/firebase-admin.js";

const mockAdminUser = {
  uid: "admin-1",
  email: "admin@test.com",
  display_name: "Admin",
  avatar_url: "",
  credits: 1000,
  role: "admin",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const mockGenreDoc = {
  name: "Fantasy",
  slug: "fantasy",
};

function setupAdminAuth() {
  mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
  mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAdminUser });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/admin/genres ───────────────────────────────────────────────

describe("GET /api/admin/genres", () => {
  it("returns 200 with paginated genre list", async () => {
    setupAdminAuth();
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ id: "genre-1", data: () => mockGenreDoc }],
    });

    const res = await app.request("/api/admin/genres", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].name).toBe("Fantasy");
  });
});

// ─── POST /api/admin/genres ──────────────────────────────────────────────

describe("POST /api/admin/genres", () => {
  it("returns 201 with created genre", async () => {
    setupAdminAuth();
    // Duplicate check → not exists
    mockDocGet.mockResolvedValueOnce({ exists: false });
    mockDocSet.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/genres", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Action" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Action");
    expect(body.data.id).toBe("action");
    expect(body.data.slug).toBe("action");
  });

  it("returns 400 when name is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/genres", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 409 when slug already exists", async () => {
    setupAdminAuth();
    // Duplicate check → exists
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ name: "Action" }) });

    const res = await app.request("/api/admin/genres", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Action" }),
    });

    expect(res.status).toBe(409);
  });
});

// ─── DELETE /api/admin/genres/:genreId ───────────────────────────────────

describe("DELETE /api/admin/genres/:genreId", () => {
  it("returns 200 when no linked novels", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockGenreDoc });
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const res = await app.request("/api/admin/genres/genre-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
  });

  it("returns 409 when genre has linked novels", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockGenreDoc });
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ novel_id: "novel-1", genre_id: "genre-1" }) }],
      empty: false,
    });

    const res = await app.request("/api/admin/genres/genre-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(409);
  });
});
