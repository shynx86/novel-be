import { Hono } from "hono";
import type { Permission } from "../config/permissions.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  actorHasPermission,
  assertAnyPermission,
  assertOwnedPermission,
  loadActorMiddleware,
  requirePermission,
} from "../middleware/authorization.js";
import { publishBetaRun } from "../services/beta-publisher.js";
import {
  cancelBetaRun,
  createBetaRun,
  getBetaChapterComparison,
  getBetaRunWithChapters,
  listBetaRuns,
  retryBetaRun,
} from "../services/beta-run.js";
import { enqueueBetaChapterTask } from "../services/beta-task-dispatcher.js";
import { getNovel } from "../services/novel.js";
import type { Actor } from "../types/auth.js";
import { ValidationError } from "../utils/errors.js";
import { parsePagination } from "../utils/pagination.js";

type Variables = {
  user: unknown;
  userId: string;
  actor: Actor;
};

const adminNovelBeta = new Hono<{ Variables: Variables }>();

adminNovelBeta.use("/*", authMiddleware, loadActorMiddleware, requirePermission("admin.access"));

async function assertNovelScope(
  actor: Actor,
  novelId: string,
  ownPermission: Permission,
  anyPermission: Permission,
): Promise<void> {
  if (actorHasPermission(actor, anyPermission)) return;
  const novel = await getNovel(novelId);
  assertOwnedPermission(actor, novel.translator_id, ownPermission, anyPermission);
}

async function assertCanViewBeta(actor: Actor, novelId: string): Promise<void> {
  assertAnyPermission(actor, ["novels.beta.generate", "novels.beta.publish"]);
  await assertNovelScope(actor, novelId, "novels.view.own", "novels.view.any");
}

// POST /api/admin/novels/:novelId/beta-runs
adminNovelBeta.post("/:novelId/beta-runs", requirePermission("novels.beta.generate"), async (c) => {
  const novelId = c.req.param("novelId");
  const actor = c.get("actor");
  await assertNovelScope(actor, novelId, "novels.view.own", "novels.view.any");

  const body = await c.req.json().catch(() => ({}));
  const customPrompt = body.custom_prompt;
  const model = body.model;

  const result = await createBetaRun(novelId, { custom_prompt: customPrompt, model }, actor.userId);
  await enqueueBetaChapterTask({
    novelId,
    runId: result.id,
    chapterIndex: result.first_chapter_index,
  });
  return c.json({ data: result }, 202);
});

// GET /api/admin/novels/:novelId/beta-runs
adminNovelBeta.get("/:novelId/beta-runs", async (c) => {
  const novelId = c.req.param("novelId");
  const actor = c.get("actor");
  await assertCanViewBeta(actor, novelId);

  const { page, limit } = parsePagination(c.req.query("page"), c.req.query("limit"), 20);
  const result = await listBetaRuns(novelId, page, limit);
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId/beta-runs/:runId
adminNovelBeta.get("/:novelId/beta-runs/:runId", async (c) => {
  const novelId = c.req.param("novelId");
  const runId = c.req.param("runId");
  const actor = c.get("actor");
  await assertCanViewBeta(actor, novelId);

  const result = await getBetaRunWithChapters(novelId, runId);
  return c.json({ data: result }, 200);
});

// GET /api/admin/novels/:novelId/beta-runs/:runId/chapters/:index
adminNovelBeta.get("/:novelId/beta-runs/:runId/chapters/:index", async (c) => {
  const novelId = c.req.param("novelId");
  const runId = c.req.param("runId");
  const chapterIndex = Number(c.req.param("index"));
  const actor = c.get("actor");
  await assertCanViewBeta(actor, novelId);

  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    throw new ValidationError("index must be a positive integer", { field: "index" });
  }

  const comparison = await getBetaChapterComparison(novelId, runId, chapterIndex);
  return c.json({ data: comparison }, 200);
});

// POST /api/admin/novels/:novelId/beta-runs/:runId/retry
adminNovelBeta.post(
  "/:novelId/beta-runs/:runId/retry",
  requirePermission("novels.beta.generate"),
  async (c) => {
    const novelId = c.req.param("novelId");
    const runId = c.req.param("runId");
    const actor = c.get("actor");
    await assertNovelScope(actor, novelId, "novels.view.own", "novels.view.any");

    const body = await c.req.json().catch(() => ({}));
    const chapterIndexes: number[] | undefined = Array.isArray(body.chapter_indexes)
      ? body.chapter_indexes.filter(
          (value: unknown): value is number =>
            typeof value === "number" && Number.isInteger(value) && value > 0,
        )
      : undefined;

    const retriedIndexes = await retryBetaRun(novelId, runId, actor.userId, chapterIndexes);
    if (retriedIndexes.length > 0) {
      await enqueueBetaChapterTask({
        novelId,
        runId,
        chapterIndex: Math.min(...retriedIndexes),
      });
    }
    return c.json({ data: { run_id: runId, retried_chapter_indexes: retriedIndexes } }, 200);
  },
);

// POST /api/admin/novels/:novelId/beta-runs/:runId/cancel
adminNovelBeta.post(
  "/:novelId/beta-runs/:runId/cancel",
  requirePermission("novels.beta.generate"),
  async (c) => {
    const novelId = c.req.param("novelId");
    const runId = c.req.param("runId");
    const actor = c.get("actor");
    await assertNovelScope(actor, novelId, "novels.view.own", "novels.view.any");

    const result = await cancelBetaRun(novelId, runId, actor.userId);
    return c.json({ data: result }, 200);
  },
);

// POST /api/admin/novels/:novelId/beta-runs/:runId/publish
adminNovelBeta.post(
  "/:novelId/beta-runs/:runId/publish",
  requirePermission("novels.beta.publish"),
  async (c) => {
    const novelId = c.req.param("novelId");
    const runId = c.req.param("runId");
    const actor = c.get("actor");
    await assertNovelScope(actor, novelId, "novels.view.own", "novels.view.any");

    const result = await publishBetaRun(novelId, runId, actor.userId);
    return c.json({ data: result }, 200);
  },
);

export { adminNovelBeta };
