import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import { mockDocGet } from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/genres/:slug", () => {
  it("returns one genre by slug", async () => {
    mockDocGet.mockResolvedValue({
      id: "ngon-tinh",
      exists: true,
      data: () => ({ name: "Ngôn Tình", slug: "ngon-tinh" }),
    });

    const res = await app.request("/api/genres/ngon-tinh");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { id: "ngon-tinh", name: "Ngôn Tình", slug: "ngon-tinh" },
    });
  });

  it("returns 404 when the genre does not exist", async () => {
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await app.request("/api/genres/khong-ton-tai");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
