import admin from "firebase-admin";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let adminApp: admin.app.App | null = null;
let initError: string | null = null;

function getAdminApp(): admin.app.App | null {
  try {
    if (!adminApp) {
      adminApp = admin.initializeApp({
        projectId: env.projectId || undefined,
      });
    }
    return adminApp;
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    logger.error("Firebase Admin init failed", { error: initError });
    return null;
  }
}

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
    firestoreError = initError ?? undefined;
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
