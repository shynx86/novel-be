import admin from "firebase-admin";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let adminApp: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (!adminApp) {
    adminApp = admin.initializeApp({
      projectId: env.projectId || undefined,
    });
    logger.info("Firebase Admin initialized", { projectId: env.projectId });
  }
  return adminApp;
}

export function getAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}

export function getFirestore(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}
