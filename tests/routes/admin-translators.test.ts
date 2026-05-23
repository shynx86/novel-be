import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCollectionAdd,
  mockCountGet,
  mockDocGet,
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

const mockTranslatorDoc = {
  name: "Test Translator",
  slug: "test-translator",
  bio: "A test translator",
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

// ─── GET /api/admin/translators ──────────────────────────────────────────

describe("GET /api/admin/translators", () => {
  it("returns 200 with paginated translator list", async () => {
    setupAdminAuth();
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ id: "translator-1", data: () => mockTranslatorDoc }],
    });

    const res = await app.request("/api/admin/translators", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].name).toBe("Test Translator");
  });
});

// ─── POST /api/admin/translators ─────────────────────────────────────────

describe("POST /api/admin/translators", () => {
  it("returns 201 with created translator", async () => {
    setupAdminAuth();
    mockCollectionAdd.mockResolvedValue({ id: "translator-new" });

    const res = await app.request("/api/admin/translators", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New Translator" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("New Translator");
  });

  it("returns 400 when name is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/translators", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/admin/translators/:translatorId ─────────────────────────

describe("DELETE /api/admin/translators/:translatorId", () => {
  it("returns 200 when no linked novels", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockTranslatorDoc });
    mockQueryGet.mockResolvedValue({ docs: [], empty: true });

    const res = await app.request("/api/admin/translators/translator-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
  });

  it("returns 409 when translator has linked novels", async () => {
    setupAdminAuth();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockTranslatorDoc });
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ({ novel_id: "novel-1", translator_id: "translator-1" }) }],
      empty: false,
    });

    const res = await app.request("/api/admin/translators/translator-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(409);
  });
});
