import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";
const DRY_RUN = process.env.DRY_RUN === "true";

const BETA_PERMISSIONS = ["novels.beta.generate", "novels.beta.publish"];

async function migrate(): Promise<void> {
  const serviceAccount = JSON.parse(readFileSync("./service-account.json", "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
  const db = admin.firestore();

  const adminRef = db.collection("roles").doc("admin");
  const adminDoc = await adminRef.get();
  if (!adminDoc.exists) {
    console.log("Admin role document not found; nothing to migrate.");
    return;
  }

  const data = adminDoc.data() ?? {};
  const current: string[] = Array.isArray(data.permissions) ? data.permissions : [];
  const missing = BETA_PERMISSIONS.filter((permission) => !current.includes(permission));

  if (missing.length === 0) {
    console.log("Admin role already has all beta permissions. Nothing to do.");
    return;
  }

  const next = Array.from(new Set([...current, ...missing]));
  if (!DRY_RUN) {
    const batch = db.batch();
    batch.update(adminRef, { permissions: next, updated_at: new Date().toISOString() });
    batch.set(db.collection("permission_audit_logs").doc(), {
      actor_id: "migration:beta-permissions",
      role_id: "admin",
      action: "update",
      old_permissions: current,
      new_permissions: next,
      created_at: new Date().toISOString(),
    });
    await batch.commit();
  }
  console.log(
    `Added ${missing.length} beta permission(s) to admin role (${DRY_RUN ? "dry run" : "live"}): ${missing.join(", ")}`,
  );
}

migrate().catch((error) => {
  console.error("Beta permission migration failed:", error);
  process.exit(1);
});
