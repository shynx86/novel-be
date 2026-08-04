import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCountGet,
  mockDocGet,
  mockQueryGet,
  mockTransactionGet,
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

const mockAuthorDoc = {
  name: "Test Author",
  slug: "test-author",
  bio: "A test author",
  avatar_url: "",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

function setupAdminAuth() {
  mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
  mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAdminUser });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/admin/authors ───────────────────────────────────────────────

describe("GET /api/admin/authors", () => {
  it("returns 200 with paginated author list", async () => {
    setupAdminAuth();
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ id: "author-1", data: () => mockAuthorDoc }],
    });

    const res = await app.request("/api/admin/authors", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].name).toBe("Test Author");
  });
});

// ─── GET /api/admin/authors/:authorId ─────────────────────────────────────

describe("GET /api/admin/authors/:authorId", () => {
  it("returns 200 with author detail", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc });

    const res = await app.request("/api/admin/authors/author-1", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Test Author");
  });
});

// ─── POST /api/admin/authors ──────────────────────────────────────────────

describe("POST /api/admin/authors", () => {
  it("returns 201 with created author", async () => {
    setupAdminAuth();
    mockTransactionGet.mockResolvedValueOnce({ exists: false });

    const res = await app.request("/api/admin/authors", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Nguyễn Nhật Ánh" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Nguyễn Nhật Ánh");
    expect(body.data.id).toBe("nguyen-nhat-anh");
    expect(body.data.slug).toBe("nguyen-nhat-anh");
  });

  it("returns 400 when name is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/authors", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 409 when the normalized slug already exists", async () => {
    setupAdminAuth();
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc });

    const res = await app.request("/api/admin/authors", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Nguyễn Nhật Ánh" }),
    });

    expect(res.status).toBe(409);
  });
});

// ─── PATCH /api/admin/authors/:authorId ───────────────────────────────────

describe("PATCH /api/admin/authors/:authorId", () => {
  it("rejects changing an existing slug", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc });

    const res = await app.request("/api/admin/authors/test-author", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: "another-author" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 200 with updated author", async () => {
    setupAdminAuth();
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc })
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockAuthorDoc, name: "Updated" }) });

    const res = await app.request("/api/admin/authors/author-1", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated");
  });
});

// ─── DELETE /api/admin/authors/:authorId ──────────────────────────────────

describe("DELETE /api/admin/authors/:authorId", () => {
  it("returns 200 when no linked novels", async () => {
    setupAdminAuth();
    // getAuthor check
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc });
    // novel_authors check → empty
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const res = await app.request("/api/admin/authors/author-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });

  it("returns 409 when author has linked novels", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAuthorDoc });
    // novel_authors check → has linked novels
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ novel_id: "novel-1", author_id: "author-1" }) }],
      empty: false,
    });

    const res = await app.request("/api/admin/authors/author-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(409);
  });
});
