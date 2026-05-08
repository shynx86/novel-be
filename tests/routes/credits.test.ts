import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockDocGet,
  mockRunTransaction,
  mockTransactionGet,
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

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/credits/balance ─────────────────────────────────────────

describe("GET /api/credits/balance", () => {
  it("returns 200 with credit balance", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ credits: 150, role: "user" }),
    });

    const res = await app.request("/api/credits/balance", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.credits).toBe(150);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/credits/balance");
    expect(res.status).toBe(401);
  });

  it("returns 0 credits for user with no credits field", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: "user" }),
    });

    const res = await app.request("/api/credits/balance", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.credits).toBe(0);
  });
});

// ─── POST /api/admin/credits/topup ────────────────────────────────────

describe("POST /api/admin/credits/topup", () => {
  function setupAdminAuth() {
    mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAdminUser });
  }

  it("returns 200 with topup result", async () => {
    setupAdminAuth();
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({ credits: 100, role: "user" }),
    });
    mockTransactionUpdate.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/credits/topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: "user-1", amount: 50 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user_id).toBe("user-1");
    expect(body.data.previous_balance).toBe(100);
    expect(body.data.amount_added).toBe(50);
    expect(body.data.new_balance).toBe(150);
  });

  it("returns 400 when user_id is missing", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/credits/topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 50 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    setupAdminAuth();

    const res = await app.request("/api/admin/credits/topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: "user-1", amount: -10 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin user", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...mockAdminUser, uid: "user-1", role: "user" }),
    });

    const res = await app.request("/api/admin/credits/topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: "user-2", amount: 50 }),
    });

    expect(res.status).toBe(403);
  });
});
