import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockBatchCommit,
  mockBatchDelete,
  mockCollectionAdd,
  mockCountGet,
  mockDocDelete,
  mockDocGet,
  mockDocSet,
  mockDocUpdate,
  mockQueryGet,
  mockRunTransaction,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionUpdate,
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

const mockRegularUser = {
  ...mockAdminUser,
  uid: "user-1",
  role: "user",
};

const mockNovelDoc = {
  title: "Test Novel",
  description: "A test novel",
  author: "Author",
  cover_url: "",
  genre: ["Fantasy"],
  status: "ongoing",
  chapter_count: 0,
  total_word_count: 0,
  price: null,
  created_at: "2026-05-08T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
};

function setupAdminAuth() {
  mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
  // First docGet call is adminMiddleware reading user doc
  mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAdminUser });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /api/admin/novels ───────────────────────────────────────────

describe("POST /api/admin/novels", () => {
  it("returns 201 with created novel", async () => {
    setupAdminAuth();
    mockCollectionAdd.mockResolvedValue({ id: "novel-new" });

    const res = await app.request("/api/admin/novels", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "New Novel",
        author: "Author Name",
        genre: ["Fantasy", "Adventure"],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe("New Novel");
  });

  it("returns 400 when title is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/novels", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ author: "Author" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when author is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/novels", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Novel" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin user", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRegularUser });

    const res = await app.request("/api/admin/novels", {
      method: "POST",
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Novel", author: "Author" }),
    });

    expect(res.status).toBe(403);
  });
});

// ─── GET /api/admin/novels/:novelId ────────────────────────────────────

describe("GET /api/admin/novels/:novelId", () => {
  it("returns 200 with novel detail", async () => {
    setupAdminAuth();
    // Second docGet is the route reading novel
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc });

    const res = await app.request("/api/admin/novels/novel-1", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Test Novel");
  });
});

// ─── PATCH /api/admin/novels/:novelId ──────────────────────────────────

describe("PATCH /api/admin/novels/:novelId", () => {
  it("returns 200 with updated novel", async () => {
    setupAdminAuth();
    // getNovel reads doc
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc });
    mockDocUpdate.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/novels/novel-1", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Updated Title", price: 50 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Updated Title");
    expect(body.data.price).toBe(50);
  });
});

// ─── DELETE /api/admin/novels/:novelId ─────────────────────────────────

describe("DELETE /api/admin/novels/:novelId", () => {
  it("returns 200 after deleting novel", async () => {
    setupAdminAuth();
    // getNovel check
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc });
    // Chapters subcollection query (for batch delete)
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });
    mockDocDelete.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/novels/novel-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });
});

// ─── POST /api/admin/novels/:novelId/chapters ──────────────────────────

describe("POST /api/admin/novels/:novelId/chapters", () => {
  it("returns 201 with created chapter", async () => {
    setupAdminAuth();
    // Transaction: get existing chapters (empty)
    mockTransactionGet.mockResolvedValue({ empty: true, docs: [] });
    mockTransactionSet.mockResolvedValue(undefined);
    mockTransactionUpdate.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/novels/novel-1/chapters", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Chapter 1",
        content: "Once upon a time there was a brave knight.",
        access_type: "free",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe("Chapter 1");
    expect(body.data.index).toBe(1);
    expect(body.data.access_type).toBe("free");
    expect(body.data.price).toBe(0);
  });

  it("sets price for paid chapters", async () => {
    setupAdminAuth();
    mockTransactionGet.mockResolvedValue({ empty: true, docs: [] });
    mockTransactionSet.mockResolvedValue(undefined);
    mockTransactionUpdate.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/novels/novel-1/chapters", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Chapter 1",
        content: "Paid content here",
        access_type: "paid",
        price: 15,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.access_type).toBe("paid");
    expect(body.data.price).toBe(15);
  });

  it("returns 400 when title is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/novels/novel-1/chapters", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "Some content",
        access_type: "free",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when access_type is invalid", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/novels/novel-1/chapters", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Chapter",
        content: "Content",
        access_type: "invalid",
      }),
    });

    expect(res.status).toBe(400);
  });
});
