import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { app } from "../../src/app.js";
import { mockDocGet, mockRoleDocGet, mockVerifyIdToken } from "../__mocks__/firebase-admin.js";

const mockEditorUser = {
  uid: "editor-1",
  email: "editor@test.com",
  display_name: "Editor",
  avatar_url: "",
  credits: 1000,
  role: "editor",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: "editor-1" });
  mockRoleDocGet.mockResolvedValue({
    exists: true,
    data: () => ({ permissions: ["admin.access"] }),
  });
});

async function authRequest(path: string, method: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      Authorization: "Bearer editor-token",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/admin/novels/:novelId/beta-runs permissions", () => {
  it("blocks creation without novels.beta.generate", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockEditorUser });

    const res = await authRequest("/api/admin/novels/novel-1/beta-runs", "POST", {
      custom_prompt: "hay hơn",
    });

    expect(res.status).toBe(403);
  });

  it("blocks publish without novels.beta.publish", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockEditorUser });

    const res = await authRequest("/api/admin/novels/novel-1/beta-runs/run-1/publish", "POST");

    expect(res.status).toBe(403);
  });

  it("blocks cancelling without novels.beta.generate", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockEditorUser });

    const res = await authRequest("/api/admin/novels/novel-1/beta-runs/run-1/cancel", "POST");

    expect(res.status).toBe(403);
  });

  it("blocks viewing runs without either beta permission", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => mockEditorUser });

    const res = await authRequest("/api/admin/novels/novel-1/beta-runs", "GET");

    expect(res.status).toBe(403);
  });
});
