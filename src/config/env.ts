export const env = {
  port: Number.parseInt(process.env.SERVER_PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || "",
  firebaseApiKey: process.env.WEB_API_KEY || "",
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "",
  version: process.env.npm_package_version || "1.0.0",
} as const;
