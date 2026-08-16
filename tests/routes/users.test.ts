import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import { mockQueryGet } from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/users/:username/profile", () => {
  it("returns an allow-listed public translator profile and public-only stats", async () => {
    mockQueryGet
      .mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "translator-1",
            data: () => ({
              username: "moon",
              username_lowercase: "moon",
              display_name: "Moon",
              avatar_url: "https://example.com/avatar.webp",
              bio: "Dịch giả truyện ngôn tình",
              role: "admin",
              email: "private@example.com",
              credits: 999,
              created_at: "2026-01-01T00:00:00.000Z",
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "public-novel",
            data: () => ({
              slug: "public-novel",
              title: "Public Novel",
              publication_status: "public",
              status: "ongoing",
              chapter_count: 12,
              views: 1500,
              followers: 20,
              comment_count: 4,
              updated_at: "2026-08-01T00:00:00.000Z",
            }),
          },
          {
            id: "draft-novel",
            data: () => ({
              slug: "draft-novel",
              title: "Draft Novel",
              publication_status: "draft",
              chapter_count: 5,
              views: 50,
            }),
          },
        ],
      });

    const res = await app.request("/api/users/moon/profile");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.display_name).toBe("Moon");
    expect(body.data.role).toBe("admin");
    expect(body.data.email).toBeUndefined();
    expect(body.data.credits).toBeUndefined();
    expect(body.data.translator_stats).toMatchObject({
      novel_count: 1,
      public_count: 1,
      draft_count: 0,
      chapter_count: 12,
      total_views: 1500,
    });
    expect(body.data.translator_stats.top_novels).toHaveLength(1);
  });
});
