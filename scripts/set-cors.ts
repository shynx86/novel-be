import admin from "firebase-admin";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || "novel-ecbcc";

admin.initializeApp({
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
});

const bucket = admin.storage().bucket();

const corsConfig = [
  {
    origin: ["http://localhost:3000", "http://localhost:3001", "https://novel-fe-six.vercel.app"],
    method: ["GET", "PUT", "HEAD"],
    responseHeader: ["Content-Type", "Content-Length", "Content-MD5"],
    maxAgeSeconds: 3600,
  },
];

await bucket.setCorsConfiguration(corsConfig);
console.log("CORS configuration applied successfully to", bucket.name);

const [metadata] = await bucket.getMetadata();
console.log("Current CORS:", JSON.stringify(metadata.cors, null, 2));

process.exit(0);
