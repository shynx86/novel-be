import { Hono } from "hono";
import { checkHealth } from "../services/health.js";

const health = new Hono();

health.get("/", async (c) => {
  const status = await checkHealth();
  // Always return 200 for health - the API itself is responsive
  // Clients should check body.status for service-level health
  return c.json(status);
});

export { health };
