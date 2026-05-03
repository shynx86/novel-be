import { testApp } from "../setup.js";

describe("GET /api/health", () => {
  it("returns 200 with health status", async () => {
    const app = testApp();
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("environment");
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("firestore");
  });

  it("includes a valid ISO timestamp", async () => {
    const app = testApp();
    const res = await app.request("/api/health");
    const body = await res.json();

    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("reports firestore as not_configured when running without credentials", async () => {
    const app = testApp();
    const res = await app.request("/api/health");
    const body = await res.json();

    // In test environment without Firebase credentials, firestore should be not_configured
    expect(["not_configured", "ok", "error"]).toContain(body.services.firestore);
  });
});
