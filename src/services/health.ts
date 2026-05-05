import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { getAdminApp } from "./firebase.js";

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  environment: string;
  services: {
    firestore: "ok" | "error" | "not_configured";
    error?: string;
  };
}

export async function checkHealth(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();
  let firestoreStatus: "ok" | "error" | "not_configured" = "ok";
  let firestoreError: string | undefined;

  const app = getAdminApp();
  if (!app) {
    firestoreStatus = "not_configured";
  } else {
    try {
      // List collections proves: API is enabled, credentials work, database exists
      // NOT_FOUND is fine — means we're connected but database is empty
      await app.firestore().listCollections();
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      const msg = err instanceof Error ? err.message : String(err);

      // Code 5 = NOT_FOUND: connected successfully, just no collections yet
      if (code === 5) {
        firestoreStatus = "ok";
      } else {
        logger.error("Firestore health check failed", { error: msg });
        firestoreStatus = "error";
        firestoreError = msg;
      }
    }
  }

  const overallStatus = firestoreStatus === "ok" ? "ok" : "degraded";

  return {
    status: overallStatus,
    timestamp,
    version: env.version,
    environment: env.nodeEnv,
    services: {
      firestore: firestoreStatus,
      ...(firestoreError && { error: firestoreError }),
    },
  };
}
