import { serve } from "@hono/node-server";
import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";

serve({
  fetch: app.fetch,
  port: env.port,
});

console.log(`[novel-be] Server running on http://localhost:${env.port}`);
console.log(`[novel-be] Health check: http://localhost:${env.port}/api/health`);
console.log(`[novel-be] Environment: ${env.nodeEnv}`);
