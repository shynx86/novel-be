import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockDocGet,
  mockGetAll,
  mockQueryGet,
  mockRoleDocGet,
  mockVerifyIdToken,
} from "../__mocks__/firebase-admin.js";

const adminUser = {
  uid: "admin-1",
  email: "admin@test.com",
  display_name: "Admin",
  avatar_url: "",
  credits: 0,
  role: "admin",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function runDoc(id: string, status: string, createdAt: string) {
  return {
    id,
    data: () => ({
      novel_id: "novel-1",
      status,
      target_count: 10,
      completed_count: status === "published" ? 10 : 4,
      failed_count: 0,
      current_chapter_index: null,
      model: "test-model",
      requested_by: "admin-1",
      created_at: createdAt,
      started_at: createdAt,
      completed_at: status === "published" ? createdAt : null,
      published_at: status === "published" ? createdAt : null,
      cancelled_at: status === "cancelled" ? createdAt : null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: "admin-1" });
  mockDocGet.mockResolvedValue({ exists: true, data: () => adminUser });
  // Use the built-in admin role, which contains all current permissions.
  mockRoleDocGet.mockResolvedValue({ exists: false, data: () => undefined });
});

describe("GET /api/admin/beta/runs", () => {
  it("returns every beta version regardless of status", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        runDoc("run-published", "published", "2026-08-22T01:00:00.000Z"),
        runDoc("run-cancelled", "cancelled", "2026-08-22T02:00:00.000Z"),
      ],
      empty: false,
    });
    mockGetAll.mockResolvedValue([
      {
        id: "novel-1",
        exists: true,
        data: () => ({ slug: "novel-1", title: "Novel 1", translator_id: "admin-1" }),
      },
    ]);

    const response = await app.request("/api/admin/beta/runs", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((item: { status: string }) => item.status)).toEqual([
      "cancelled",
      "published",
    ]);
  });
});
