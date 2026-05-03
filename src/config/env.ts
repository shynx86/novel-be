export const env = {
  port: Number.parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "",
  version: process.env.npm_package_version || "1.0.0",
} as const;
