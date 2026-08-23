import type admin from "firebase-admin";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import {
  actorHasPermission,
  assertAnyPermission,
  loadActorMiddleware,
  requirePermission,
} from "../middleware/authorization.js";
import { getBetaModelCatalog } from "../services/ai/beta-models.js";
import { getFirestore } from "../services/firebase.js";
import type { Actor } from "../types/auth.js";
import type { BetaDashboardStatus, BetaRunStatus } from "../types/beta.js";

type Variables = {
  user: unknown;
  userId: string;
  actor: Actor;
};

const ADMIN_BETA = new Hono<{ Variables: Variables }>();

ADMIN_BETA.use("/*", authMiddleware, loadActorMiddleware, requirePermission("admin.access"));

// GET /api/admin/beta/models — backend-owned catalog used by the create dialog.
ADMIN_BETA.get("/models", requirePermission("novels.beta.generate"), (c) => {
  return c.json({ data: getBetaModelCatalog() }, 200);
});

// Novel statuses shown in the "Beta" admin page: everything except
// "not_started" and "published" is still actionable.
const VISIBLE_BETA_STATUSES: BetaDashboardStatus[] = [
  "initializing",
  "queued",
  "processing",
  "partial_failed",
  "failed",
  "review_ready",
];

export interface ActiveBetaNovel {
  id: string;
  slug: string;
  title: string;
  beta_status: BetaDashboardStatus;
  has_published_beta: boolean;
  active_beta_run_id: string | null;
  latest_beta_run_id: string | null;
  beta_target_count: number;
  beta_completed_count: number;
  beta_failed_count: number;
  beta_updated_at: string | null;
  beta_last_published_at: string | null;
}

export interface AdminBetaRunListItem {
  id: string;
  novel_id: string;
  novel_slug: string;
  novel_title: string;
  status: BetaRunStatus;
  target_count: number;
  completed_count: number;
  failed_count: number;
  current_chapter_index: number | null;
  model: string;
  requested_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
}

// GET /api/admin/beta/runs — every Beta version, including terminal statuses.
ADMIN_BETA.get("/runs", async (c) => {
  const actor = c.get("actor");
  assertAnyPermission(actor, ["novels.beta.generate", "novels.beta.publish"]);

  const db = getFirestore();
  // An unfiltered collection-group query needs no extra Firestore index.
  const runsSnapshot = await db.collectionGroup("beta_runs").get();
  const novelIds = Array.from(
    new Set(
      runsSnapshot.docs
        .map((doc) => doc.data().novel_id)
        .filter((novelId): novelId is string => typeof novelId === "string" && novelId.length > 0),
    ),
  );
  const novelDocs =
    novelIds.length > 0
      ? await db.getAll(...novelIds.map((novelId) => db.collection("novels").doc(novelId)))
      : [];
  const novels = new Map(
    novelDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() ?? {}] as const),
  );
  const canViewAnyNovel = actorHasPermission(actor, "novels.view.any");

  const items: AdminBetaRunListItem[] = [];
  for (const runDoc of runsSnapshot.docs) {
    const run = runDoc.data();
    const novelId = typeof run.novel_id === "string" ? run.novel_id : "";
    const novel = novels.get(novelId);
    if (!novel) continue;
    if (!canViewAnyNovel && novel.translator_id !== actor.userId) continue;

    items.push({
      id: runDoc.id,
      novel_id: novelId,
      novel_slug: novel.slug ?? novelId,
      novel_title: novel.title ?? novelId,
      status: run.status,
      target_count: run.target_count ?? 0,
      completed_count: run.completed_count ?? 0,
      failed_count: run.failed_count ?? 0,
      current_chapter_index: run.current_chapter_index ?? null,
      model: run.model ?? "",
      requested_by: run.requested_by ?? "",
      created_at: run.created_at,
      started_at: run.started_at ?? null,
      completed_at: run.completed_at ?? null,
      published_at: run.published_at ?? null,
      cancelled_at: run.cancelled_at ?? null,
    });
  }

  items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return c.json({ data: items }, 200);
});

// GET /api/admin/beta/active
ADMIN_BETA.get("/active", async (c) => {
  const actor = c.get("actor");
  assertAnyPermission(actor, ["novels.beta.generate", "novels.beta.publish"]);

  const db = getFirestore();
  let query: admin.firestore.Query = db
    .collection("novels")
    .where("beta_status", "in", VISIBLE_BETA_STATUSES);

  if (!actorHasPermission(actor, "novels.view.any")) {
    query = query.where("translator_id", "==", actor.userId);
  }

  const snapshot = await query.get();
  const items: ActiveBetaNovel[] = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data();
      let latestRunId = data.latest_beta_run_id ?? null;
      if (!data.active_beta_run_id && data.beta_status !== "published") {
        const latestRun = await doc.ref
          .collection("beta_runs")
          .orderBy("created_at", "desc")
          .limit(1)
          .get();
        latestRunId = latestRun.docs[0]?.id ?? latestRunId;
      }
      return {
        id: doc.id,
        slug: data.slug ?? doc.id,
        title: data.title,
        beta_status: data.beta_status,
        has_published_beta: data.has_published_beta === true,
        active_beta_run_id: data.active_beta_run_id ?? null,
        latest_beta_run_id: latestRunId,
        beta_target_count: data.beta_target_count ?? 0,
        beta_completed_count: data.beta_completed_count ?? 0,
        beta_failed_count: data.beta_failed_count ?? 0,
        beta_updated_at: data.beta_updated_at ?? null,
        beta_last_published_at: data.beta_last_published_at ?? null,
      };
    }),
  );

  // Sort newest first; sorting in memory avoids needing a composite index.
  items.sort((a, b) => (b.beta_updated_at ?? "").localeCompare(a.beta_updated_at ?? ""));

  return c.json({ data: items }, 200);
});

export { ADMIN_BETA as adminBeta };
