import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCountGet,
  mockDocGet,
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

const mockTransaction1 = {
  id: "tx-1",
  user_id: "user-1",
  type: "topup",
  amount: 50,
  balance_before: 100,
  balance_after: 150,
  performed_by: "admin-1",
  created_at: "2026-05-08T10:00:00.000Z",
};

const mockTransaction2 = {
  id: "tx-2",
  user_id: "user-1",
  type: "topup",
  amount: 30,
  balance_before: 150,
  balance_after: 180,
  performed_by: "admin-1",
  created_at: "2026-05-08T12:00:00.000Z",
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

// ─── GET /api/credits/history ─────────────────────────────────────────

describe("GET /api/credits/history", () => {
  it("returns 200 with paginated topup history", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockQueryGet.mockResolvedValue({
      docs: [
        { id: "tx-2", data: () => mockTransaction2 },
        { id: "tx-1", data: () => mockTransaction1 },
      ],
    });

    const res = await app.request("/api/credits/history?page=1&limit=10", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.data.items[0].amount).toBe(30);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/credits/history");
    expect(res.status).toBe(401);
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
    mockTransactionSet.mockResolvedValue(undefined);

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

// ─── GET /api/admin/credits/history/:userId ───────────────────────────

describe("GET /api/admin/credits/history/:userId", () => {
  function setupAdminAuth() {
    mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockAdminUser });
  }

  it("returns 200 with any user's topup history", async () => {
    setupAdminAuth();
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet.mockResolvedValue({
      docs: [{ id: "tx-1", data: () => mockTransaction1 }],
    });

    const res = await app.request("/api/admin/credits/history/user-1?page=1&limit=10", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].amount).toBe(50);
    expect(body.data.items[0].performed_by).toBe("admin-1");
  });

  it("returns 403 for non-admin user", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...mockAdminUser, uid: "user-1", role: "user" }),
    });

    const res = await app.request("/api/admin/credits/history/user-2", {
      headers: { Authorization: "Bearer user-token" },
    });

    expect(res.status).toBe(403);
  });
});
