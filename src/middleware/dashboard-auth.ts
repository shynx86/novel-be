import type { MiddlewareHandler } from "hono";
import { UnauthorizedError } from "../utils/errors.js";

function decodeBasicAuth(header: string): { username: string; password: string } | null {
  const base64 = header.slice(6);
  const decoded = atob(base64);
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return null;
  return {
    username: decoded.slice(0, colonIndex),
    password: decoded.slice(colonIndex + 1),
  };
}

export const dashboardAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Basic ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const credentials = decodeBasicAuth(authHeader);
  if (!credentials) {
    throw new UnauthorizedError("Invalid Authorization header format");
  }

  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!username || !password) {
    throw new UnauthorizedError("Dashboard authentication not configured");
  }

  if (credentials.username !== username || credentials.password !== password) {
    throw new UnauthorizedError("Invalid credentials");
  }

  await next();
};
