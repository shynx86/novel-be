export const env = {
  port: Number.parseInt(process.env.SERVER_PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || "",
  firebaseApiKey: process.env.FIREBASE_API_KEY || "",
  version: process.env.npm_package_version || "1.0.0",
} as const;
