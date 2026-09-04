import { app } from "../src/app.js";

const previewOrigin = "https://novel-fe-test-three.vercel.app";

describe("CORS", () => {
  it("allows preflight requests from the Vercel preview frontend", async () => {
    const res = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: previewOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe(previewOrigin);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not allow origins outside the explicit allowlist", async () => {
    const res = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted-preview.vercel.app",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
