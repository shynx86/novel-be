import { describe, expect, it } from "@jest/globals";
import { testApp } from "../setup.js";

describe("GET /api/search", () => {
  it("requires at least one criterion", async () => {
    const response = await testApp().request("/api/search");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects overlong title input before querying Firestore", async () => {
    const response = await testApp().request(`/api/search?title=${"a".repeat(101)}`);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
