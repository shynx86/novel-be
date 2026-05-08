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

const mockPaidChapter = {
  index: 3,
  title: "Chapter 3",
  content: "Paid content here...",
  word_count: 1700,
  access_type: "paid",
  price: 10,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const mockNovelDoc = {
  id: "novel-1",
  title: "Test Novel",
  description: "",
  author: "Author",
  cover_url: "",
  genre: ["Fantasy"],
  status: "ongoing",
  chapter_count: 3,
  total_word_count: 5000,
  price: 50,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
};

function setupAuth() {
  mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /api/subscriptions/chapter ──────────────────────────────────

describe("POST /api/subscriptions/chapter", () => {
  it("returns 200 on successful chapter subscription", async () => {
    setupAuth();
    // Chapter doc (getChapter)
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapter })
      // Novel subscription check (fast-fail) → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Chapter subscription check (fast-fail) → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    // Transaction
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({ credits: 100, role: "user" }),
    });
    mockTransactionSet.mockResolvedValue(undefined);
    mockTransactionUpdate.mockResolvedValue(undefined);

    const res = await app.request("/api/subscriptions/chapter", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1", chapter_index: 3 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe("chapter");
    expect(body.data.credits_paid).toBe(10);
    expect(body.data.credits_remaining).toBe(90);
    expect(body.data.chapter_index).toBe(3);
  });

  it("returns 402 when insufficient credits", async () => {
    setupAuth();
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapter })
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    // Transaction: user has insufficient credits
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({ credits: 5, role: "user" }),
    });

    const res = await app.request("/api/subscriptions/chapter", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1", chapter_index: 3 }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe("INSUFFICIENT_CREDITS");
    expect(body.error.details).toEqual({ required: 10, available: 5 });
  });

  it("returns 409 when already subscribed to chapter", async () => {
    setupAuth();
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapter })
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Chapter already subscribed
      .mockResolvedValueOnce({ exists: true, data: () => ({ user_id: "user-1" }) });

    const res = await app.request("/api/subscriptions/chapter", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1", chapter_index: 3 }),
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 for non-paid chapter", async () => {
    setupAuth();
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...mockPaidChapter, access_type: "free", price: 0 }),
    });

    const res = await app.request("/api/subscriptions/chapter", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1", chapter_index: 1 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when novel_id is missing", async () => {
    setupAuth();

    const res = await app.request("/api/subscriptions/chapter", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chapter_index: 3 }),
    });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/subscriptions/novel ────────────────────────────────────

describe("POST /api/subscriptions/novel", () => {
  it("returns 200 on successful novel subscription", async () => {
    setupAuth();
    // getNovel
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      // Duplicate check → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => ({ credits: 200, role: "user" }),
    });

    const res = await app.request("/api/subscriptions/novel", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe("novel");
    expect(body.data.chapter_index).toBe(-1);
    expect(body.data.credits_paid).toBe(50);
    expect(body.data.credits_remaining).toBe(150);
  });

  it("returns 400 when novel has no whole-novel price", async () => {
    setupAuth();
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...mockNovelDoc, price: null }),
    });

    const res = await app.request("/api/subscriptions/novel", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ novel_id: "novel-1" }),
    });

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/subscriptions/check/:novelId/:index ─────────────────────

describe("GET /api/subscriptions/check/:novelId/:index", () => {
  it("returns access info for free chapter", async () => {
    setupAuth();
    mockDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockPaidChapter, access_type: "free", price: 0 }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc });

    const res = await app.request("/api/subscriptions/check/novel-1/1", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.has_access).toBe(true);
    expect(body.data.access_type).toBe("free");
  });

  it("returns access info for unsubscribed paid chapter with price", async () => {
    setupAuth();
    mockDocGet
      // Chapter
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapter })
      // Novel
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      // Novel sub check
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Chapter sub check
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    const res = await app.request("/api/subscriptions/check/novel-1/3", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.has_access).toBe(false);
    expect(body.data.price).toBe(10);
    expect(body.data.novel_price).toBe(50);
  });
});
