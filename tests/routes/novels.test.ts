import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockCountGet,
  mockDocGet,
  mockGetAll,
  mockQueryGet,
  mockVerifyIdToken,
} from "../__mocks__/firebase-admin.js";

const mockNovelDoc = {
  id: "novel-1",
  title: "Test Novel",
  description: "A test novel",
  author: "Author",
  cover_url: "",
  genre: ["Fantasy"],
  status: "ongoing",
  chapter_count: 3,
  total_word_count: 5000,
  price: 100,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
};

const mockChapters = [
  {
    index: 1,
    title: "Chapter 1",
    word_count: 1500,
    access_type: "free",
    price: 0,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
  {
    index: 2,
    title: "Chapter 2",
    word_count: 1800,
    access_type: "free_auth",
    price: 0,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
  {
    index: 3,
    title: "Chapter 3",
    word_count: 1700,
    access_type: "paid",
    price: 10,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
];

const mockPaidChapterWithContent = {
  index: 3,
  title: "Chapter 3",
  content: "The paid chapter content...",
  word_count: 1700,
  access_type: "paid",
  price: 10,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/novels ──────────────────────────────────────────────────

describe("GET /api/novels", () => {
  it("returns 200 with paginated novel list", async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockQueryGet
      .mockResolvedValueOnce({
        docs: [{ id: "novel-1", data: () => mockNovelDoc }],
        empty: false,
      })
      .mockResolvedValueOnce({ docs: [], empty: true })
      .mockResolvedValueOnce({ docs: [], empty: true });

    const res = await app.request("/api/novels");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe("Test Novel");
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
  });
});

// ─── GET /api/novels/:novelId ──────────────────────────────────────────

describe("GET /api/novels/:novelId", () => {
  it("returns 200 with novel detail including relations", async () => {
    // Novel doc
    mockDocGet.mockResolvedValueOnce({ exists: true, id: "novel-1", data: () => mockNovelDoc });
    // novel_authors query
    mockQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ novel_id: "novel-1", author_id: "author-1" }) }],
    });
    // getAll for authors
    mockGetAll.mockResolvedValueOnce([
      { exists: true, id: "author-1", data: () => ({ name: "Test Author" }) },
    ]);
    // novel_genres query
    mockQueryGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ novel_id: "novel-1", genre_id: "genre-1" }) },
        { data: () => ({ novel_id: "novel-1", genre_id: "genre-2" }) },
      ],
    });
    // getAll for genres
    mockGetAll.mockResolvedValueOnce([
      { exists: true, id: "genre-1", data: () => ({ name: "Fantasy" }) },
      { exists: true, id: "genre-2", data: () => ({ name: "Adventure" }) },
    ]);

    const res = await app.request("/api/novels/novel-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Test Novel");
    expect(body.data.id).toBe("novel-1");
    expect(body.data.authors).toEqual([{ id: "author-1", name: "Test Author" }]);
    expect(body.data.genres).toEqual([
      { id: "genre-1", name: "Fantasy" },
      { id: "genre-2", name: "Adventure" },
    ]);
  });

  it("returns 200 with empty relations when none exist", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, id: "novel-1", data: () => mockNovelDoc });
    mockQueryGet.mockResolvedValueOnce({ docs: [], empty: true }); // no authors
    mockQueryGet.mockResolvedValueOnce({ docs: [], empty: true }); // no genres

    const res = await app.request("/api/novels/novel-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authors).toEqual([]);
    expect(body.data.genres).toEqual([]);
  });

  it("returns 404 when novel not found", async () => {
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await app.request("/api/novels/nonexistent");

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/novels/:novelId/chapters ──────────────────────────────────

describe("GET /api/novels/:novelId/chapters", () => {
  it("returns 200 with paginated chapter list without content", async () => {
    // First get: novel existence check
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockNovelDoc });
    // Count query
    mockCountGet.mockResolvedValue({ data: () => ({ count: 3 }) });
    // Chapters query
    mockQueryGet.mockResolvedValue({
      docs: mockChapters.map((ch) => ({ id: String(ch.index), data: () => ch })),
    });

    const res = await app.request("/api/novels/novel-1/chapters");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(3);
    expect(body.data.items[0].title).toBe("Chapter 1");
    // Content should not be included
    expect(body.data.items[0]).not.toHaveProperty("content");
  });

  it("annotates subscription status when authenticated", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    // Novel existence check
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockNovelDoc });
    // Count
    mockCountGet.mockResolvedValue({ data: () => ({ count: 3 }) });
    // Chapters query
    mockQueryGet
      .mockResolvedValueOnce({
        docs: mockChapters.map((ch) => ({ id: String(ch.index), data: () => ch })),
      })
      // Subscription query for user+novel (getUserSubscriptionsForNovel)
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              user_id: "user-1",
              novel_id: "novel-1",
              chapter_index: 3,
              type: "chapter",
            }),
          },
        ],
      });

    const res = await app.request("/api/novels/novel-1/chapters", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].is_subscribed).toBe(true); // free
    expect(body.data.items[1].is_subscribed).toBe(true); // free_auth
    expect(body.data.items[2].is_subscribed).toBe(true); // paid, purchased
  });
});

// ─── GET /api/novels/:novelId/chapters/:index ───────────────────────────

describe("GET /api/novels/:novelId/chapters/:index", () => {
  it("returns 200 for free chapter without auth", async () => {
    const freeChapter = { ...mockPaidChapterWithContent, access_type: "free", price: 0 };
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => freeChapter });

    const res = await app.request("/api/novels/novel-1/chapters/1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.content).toBe("The paid chapter content...");
  });

  it("returns 401 for free_auth chapter without auth", async () => {
    const authChapter = { ...mockPaidChapterWithContent, access_type: "free_auth", price: 0 };
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => authChapter });

    const res = await app.request("/api/novels/novel-1/chapters/2");

    expect(res.status).toBe(401);
  });

  it("returns 200 for free_auth chapter with auth", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    const authChapter = { ...mockPaidChapterWithContent, access_type: "free_auth", price: 0 };
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => authChapter });

    const res = await app.request("/api/novels/novel-1/chapters/2", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
  });

  it("returns 401 for paid chapter without auth", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapterWithContent });

    const res = await app.request("/api/novels/novel-1/chapters/3");

    expect(res.status).toBe(401);
  });

  it("returns 403 for paid chapter without subscription (includes price details)", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    // Novel then chapter
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapterWithContent })
      // Novel subscription check (-1 = whole novel) → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Chapter subscription check → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Novel doc for price info
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc });

    const res = await app.request("/api/novels/novel-1/chapters/3", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.details).toEqual({
      chapter_price: 10,
      novel_price: 100,
    });
  });

  it("returns 200 for paid chapter with chapter subscription", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    // Novel then chapter
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapterWithContent })
      // Novel subscription check → not subscribed
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      // Chapter subscription check → subscribed
      .mockResolvedValueOnce({ exists: true, data: () => ({ user_id: "user-1" }) });

    const res = await app.request("/api/novels/novel-1/chapters/3", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.content).toBe("The paid chapter content...");
  });

  it("returns 200 for paid chapter with novel-level subscription", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
    // Novel then chapter
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: true, data: () => mockPaidChapterWithContent })
      // Novel subscription check → subscribed
      .mockResolvedValueOnce({ exists: true, data: () => ({ user_id: "user-1" }) });

    const res = await app.request("/api/novels/novel-1/chapters/3", {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 for nonexistent chapter", async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => mockNovelDoc })
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    const res = await app.request("/api/novels/novel-1/chapters/999");

    expect(res.status).toBe(404);
  });
});
