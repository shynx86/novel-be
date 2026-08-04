/**
 * Migrate novels, authors, and genres so their Firestore document ID equals
 * the Vietnamese-aware slug generated from title/name.
 *
 * Dry run (default): npm run migrate:slug-document-ids
 * Apply:             npm run migrate:slug-document-ids -- --apply
 *
 * Run --apply during a maintenance window. The script copies and verifies all
 * destinations before deleting any source documents.
 */

import admin from "firebase-admin";
import {
  type SlugEntityKind,
  type SlugEntityPlan,
  planSlugEntities,
} from "../src/utils/slug-migration-plan.js";

interface RuntimeEntityPlan extends SlugEntityPlan {
  sourceRefs: admin.firestore.DocumentReference[];
}

interface PlannedWrite {
  sources: admin.firestore.DocumentReference[];
  destination: admin.firestore.DocumentReference;
  data: admin.firestore.DocumentData;
  needsWrite: boolean;
}

interface UserDocumentPlan {
  writes: PlannedWrite[];
  orphanDeletes: admin.firestore.DocumentReference[];
}

interface JunctionDocumentPlan {
  writes: PlannedWrite[];
  orphanDeletes: admin.firestore.DocumentReference[];
}

const applyChanges = process.argv.includes("--apply");
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || "";

admin.initializeApp({ projectId: projectId || undefined });
const db = admin.firestore();

function entityLabel(kind: SlugEntityKind): string {
  return kind === "novel" ? "novels" : kind === "author" ? "authors" : "genres";
}

function resolveId(
  resolver: Map<string, string>,
  value: unknown,
  context: string,
  errors: string[],
): string | undefined {
  if (typeof value !== "string" || !value) {
    errors.push(`${context}: missing ID`);
    return undefined;
  }
  const resolved = resolver.get(value);
  if (!resolved) errors.push(`${context}: unresolved ID "${value}"`);
  return resolved;
}

async function loadEntityPlans(
  kind: SlugEntityKind,
  sourceField: "title" | "name",
  errors: string[],
): Promise<{
  plans: RuntimeEntityPlan[];
  resolver: Map<string, string>;
  documentCount: number;
}> {
  const collection = entityLabel(kind);
  const snapshot = await db.collection(collection).get();
  const refs = new Map(snapshot.docs.map((doc) => [doc.id, doc.ref]));
  const result = planSlugEntities(
    kind,
    sourceField,
    snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
  );
  errors.push(...result.errors);
  return {
    plans: result.plans.map((plan) => ({
      ...plan,
      sourceRefs: plan.sourceIds.map((id) => refs.get(id) as admin.firestore.DocumentReference),
    })),
    resolver: result.resolver,
    documentCount: snapshot.size,
  };
}

async function collectUserDocumentWrites(
  novelResolver: Map<string, string>,
  errors: string[],
): Promise<UserDocumentPlan> {
  const writes: PlannedWrite[] = [];
  const orphanDeletes: admin.firestore.DocumentReference[] = [];
  const users = await db.collection("users").get();

  for (const user of users.docs) {
    for (const childCollection of ["favorites", "reading_history"] as const) {
      const snapshot = await user.ref.collection(childCollection).get();
      const ids = new Set(snapshot.docs.map((doc) => doc.id));
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const currentNovelId =
          typeof data.novel_id === "string" && data.novel_id ? data.novel_id : doc.id;
        const novelId = novelResolver.get(currentNovelId);
        if (!novelId) {
          orphanDeletes.push(doc.ref);
          continue;
        }
        if (doc.id !== novelId && ids.has(novelId)) {
          errors.push(`${doc.ref.path}: destination ${childCollection}/${novelId} already exists`);
          continue;
        }
        writes.push({
          sources: [doc.ref],
          destination: user.ref.collection(childCollection).doc(novelId),
          data: { ...data, novel_id: novelId },
          needsWrite: doc.id !== novelId || data.novel_id !== novelId,
        });
      }
    }
  }

  return { writes, orphanDeletes };
}

async function collectJunctionWrites(
  collection: "novel_authors" | "novel_genres",
  entityField: "author_id" | "genre_id",
  novelResolver: Map<string, string>,
  entityResolver: Map<string, string>,
): Promise<JunctionDocumentPlan> {
  const snapshot = await db.collection(collection).get();
  const orphanDeletes: admin.firestore.DocumentReference[] = [];
  const planned = new Map<
    string,
    { sources: admin.firestore.DocumentReference[]; data: admin.firestore.DocumentData }
  >();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const novelId =
      typeof data.novel_id === "string" ? novelResolver.get(data.novel_id) : undefined;
    const entityId =
      typeof data[entityField] === "string" ? entityResolver.get(data[entityField]) : undefined;
    if (!novelId || !entityId) {
      orphanDeletes.push(doc.ref);
      continue;
    }

    const destinationId = `${novelId}:${entityId}`;
    const destinationData = { ...data, novel_id: novelId, [entityField]: entityId };
    const existing = planned.get(destinationId);
    if (existing) {
      existing.sources.push(doc.ref);
      if (doc.id === destinationId) existing.data = destinationData;
    } else {
      planned.set(destinationId, { sources: [doc.ref], data: destinationData });
    }
  }

  return {
    writes: [...planned].map(([destinationId, plan]) => ({
      sources: plan.sources,
      destination: db.collection(collection).doc(destinationId),
      data: plan.data,
      needsWrite:
        plan.sources.length > 1 ||
        !plan.sources.some((source) => source.id === destinationId) ||
        plan.sources.some((source) => {
          if (source.id !== destinationId) return false;
          const sourceData = snapshot.docs.find((doc) => doc.id === source.id)?.data();
          return (
            sourceData?.novel_id !== plan.data.novel_id ||
            sourceData?.[entityField] !== plan.data[entityField]
          );
        }),
    })),
    orphanDeletes,
  };
}

async function collectNovelTranslatorOrphanDeletes(
  novelResolver: Map<string, string>,
): Promise<admin.firestore.DocumentReference[]> {
  const snapshot = await db.collection("novel_translators").get();
  return snapshot.docs
    .filter((doc) => {
      const novelId = doc.data().novel_id;
      return typeof novelId !== "string" || !novelResolver.has(novelId);
    })
    .map((doc) => doc.ref);
}

async function collectSubscriptionWrites(
  novelResolver: Map<string, string>,
  errors: string[],
): Promise<PlannedWrite[]> {
  const snapshot = await db.collection("subscriptions").get();
  const existingIds = new Set(snapshot.docs.map((doc) => doc.id));
  const plannedIds = new Map<string, string>();
  const writes: PlannedWrite[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const novelId = resolveId(novelResolver, data.novel_id, `${doc.ref.path}.novel_id`, errors);
    if (!novelId) continue;
    if (typeof data.user_id !== "string" || typeof data.chapter_index !== "number") {
      errors.push(`${doc.ref.path}: invalid user_id or chapter_index`);
      continue;
    }
    const destinationId = `${data.user_id}::${novelId}::${data.chapter_index}`;
    const otherSource = plannedIds.get(destinationId);
    if (otherSource && otherSource !== doc.id) {
      errors.push(`subscriptions: documents ${otherSource} and ${doc.id} map to ${destinationId}`);
    }
    plannedIds.set(destinationId, doc.id);
    if (doc.id !== destinationId && existingIds.has(destinationId)) {
      errors.push(`${doc.ref.path}: destination subscriptions/${destinationId} already exists`);
    }
    writes.push({
      sources: [doc.ref],
      destination: db.collection("subscriptions").doc(destinationId),
      data: { ...data, novel_id: novelId },
      needsWrite: doc.id !== destinationId || data.novel_id !== novelId,
    });
  }

  return writes;
}

class BatchedWriter {
  private batch = db.batch();
  private count = 0;
  private batchNumber = 0;
  private operations: Array<{ type: "SET" | "DELETE"; path: string }> = [];

  private async commitCurrentBatch(): Promise<void> {
    if (this.count === 0) return;

    const operations = this.operations;
    await this.batch.commit();

    this.batchNumber++;
    console.log(`COMMITTED batch ${this.batchNumber}: ${operations.length} operation(s)`);
    for (const operation of operations) {
      console.log(`COMMITTED ${operation.type} ${operation.path}`);
    }

    this.batch = db.batch();
    this.count = 0;
    this.operations = [];
  }

  private async rotateIfNeeded(): Promise<void> {
    if (this.count < 400) return;
    await this.commitCurrentBatch();
  }

  async set(
    ref: admin.firestore.DocumentReference,
    data: admin.firestore.DocumentData,
  ): Promise<void> {
    await this.rotateIfNeeded();
    this.batch.set(ref, data);
    this.count++;
    this.operations.push({ type: "SET", path: ref.path });
  }

  async delete(ref: admin.firestore.DocumentReference): Promise<void> {
    await this.rotateIfNeeded();
    this.batch.delete(ref);
    this.count++;
    this.operations.push({ type: "DELETE", path: ref.path });
  }

  async flush(): Promise<void> {
    await this.commitCurrentBatch();
  }
}

async function copyDocumentTree(
  source: admin.firestore.DocumentReference,
  destination: admin.firestore.DocumentReference,
  rootData: admin.firestore.DocumentData,
  writer: BatchedWriter,
): Promise<number> {
  await writer.set(destination, rootData);
  let descendants = 0;
  const collections = await source.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    for (const doc of snapshot.docs) {
      descendants++;
      descendants += await copyDocumentTree(
        doc.ref,
        destination.collection(collection.id).doc(doc.id),
        doc.data(),
        writer,
      );
    }
  }
  return descendants;
}

async function countDescendants(ref: admin.firestore.DocumentReference): Promise<number> {
  let count = 0;
  const collections = await ref.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    count += snapshot.size;
    for (const doc of snapshot.docs) count += await countDescendants(doc.ref);
  }
  return count;
}

async function deleteDocumentTree(
  ref: admin.firestore.DocumentReference,
  writer: BatchedWriter,
): Promise<void> {
  const collections = await ref.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    for (const doc of snapshot.docs) await deleteDocumentTree(doc.ref, writer);
  }
  await writer.delete(ref);
}

async function verifyDestinations(
  entityPlans: RuntimeEntityPlan[],
  writes: PlannedWrite[],
  descendantCounts: Map<string, number>,
): Promise<void> {
  const errors: string[] = [];
  for (const plan of entityPlans) {
    const destination = db.collection(entityLabel(plan.kind)).doc(plan.newId);
    const doc = await destination.get();
    if (!doc.exists || doc.data()?.slug !== plan.newId) {
      errors.push(`${destination.path}: missing or slug mismatch after copy`);
    }
    const novelSource = plan.kind === "novel" ? plan.sourceRefs[0] : undefined;
    if (novelSource && novelSource.id !== plan.newId) {
      const expected = descendantCounts.get(novelSource.path) ?? 0;
      const actual = await countDescendants(destination);
      if (expected !== actual) {
        errors.push(`${destination.path}: expected ${expected} descendants, found ${actual}`);
      }
    }
  }
  for (const write of writes) {
    const doc = await write.destination.get();
    const data = doc.data();
    if (!doc.exists || !data) {
      errors.push(`${write.destination.path}: missing after copy`);
      continue;
    }
    for (const field of ["novel_id", "author_id", "genre_id"] as const) {
      if (write.data[field] !== undefined && data[field] !== write.data[field]) {
        errors.push(`${write.destination.path}: ${field} mismatch after copy`);
      }
    }
  }
  if (errors.length > 0) throw new Error(`Verification failed:\n${errors.join("\n")}`);
}

async function verifyCleanup(deletedRefs: admin.firestore.DocumentReference[]): Promise<void> {
  const remaining: string[] = [];
  for (const ref of deletedRefs) if ((await ref.get()).exists) remaining.push(ref.path);
  if (remaining.length > 0) {
    throw new Error(`Cleanup verification failed; old documents remain:\n${remaining.join("\n")}`);
  }
}

function uniqueReferences(
  refs: admin.firestore.DocumentReference[],
): admin.firestore.DocumentReference[] {
  return [...new Map(refs.map((ref) => [ref.path, ref])).values()];
}

async function migrate(): Promise<void> {
  const errors: string[] = [];
  const [novelResult, authorResult, genreResult] = await Promise.all([
    loadEntityPlans("novel", "title", errors),
    loadEntityPlans("author", "name", errors),
    loadEntityPlans("genre", "name", errors),
  ]);

  const [
    authorJunctionPlan,
    genreJunctionPlan,
    subscriptions,
    userDocumentPlan,
    translatorOrphanDeletes,
  ] = await Promise.all([
    collectJunctionWrites(
      "novel_authors",
      "author_id",
      novelResult.resolver,
      authorResult.resolver,
    ),
    collectJunctionWrites("novel_genres", "genre_id", novelResult.resolver, genreResult.resolver),
    collectSubscriptionWrites(novelResult.resolver, errors),
    collectUserDocumentWrites(novelResult.resolver, errors),
    collectNovelTranslatorOrphanDeletes(novelResult.resolver),
  ]);

  const entities = [...novelResult.plans, ...authorResult.plans, ...genreResult.plans];
  const dependentWrites = [
    ...authorJunctionPlan.writes,
    ...genreJunctionPlan.writes,
    ...subscriptions,
    ...userDocumentPlan.writes,
  ];
  const entityDeletes = entities.flatMap((plan) =>
    plan.sourceRefs.filter((ref) => ref.id !== plan.newId).map((ref) => ({ kind: plan.kind, ref })),
  );
  const dependentDeletes = uniqueReferences(
    dependentWrites.flatMap((write) =>
      write.sources.filter((source) => source.path !== write.destination.path),
    ),
  );
  const orphanJunctionDeletes = uniqueReferences([
    ...authorJunctionPlan.orphanDeletes,
    ...genreJunctionPlan.orphanDeletes,
    ...translatorOrphanDeletes,
  ]);
  const orphanUserDocumentDeletes = uniqueReferences(userDocumentPlan.orphanDeletes);
  const orphanDeletes = uniqueReferences([...orphanJunctionDeletes, ...orphanUserDocumentDeletes]);
  const mergedEntities = entities.filter((plan) => plan.merged);
  const retainedAuthors = entities.filter((plan) => plan.retainedUuid);
  const deduplicatedDependents = dependentWrites.reduce(
    (count, write) => count + Math.max(0, write.sources.length - 1),
    0,
  );
  const plannedWrites =
    entities.filter((plan) => plan.needsWrite).length +
    dependentWrites.filter((write) => write.needsWrite).length;

  console.log(`Project: ${projectId || "(default credentials project)"}`);
  console.log(`Mode: ${applyChanges ? "APPLY" : "DRY RUN"}`);
  console.log(
    `Entities: ${novelResult.documentCount} novels, ${authorResult.documentCount} authors, ${genreResult.documentCount} genres`,
  );
  console.log(`Entity moves: ${entityDeletes.length}`);
  console.log(`Entity merges: ${mergedEntities.length}`);
  console.log(`Authors retaining UUID: ${retainedAuthors.length}`);
  console.log(`Dependent moves: ${dependentDeletes.length}`);
  console.log(`Dependent deduplications: ${deduplicatedDependents}`);
  console.log(`Planned writes: ${plannedWrites}`);
  console.log(`Orphan junction deletes: ${orphanJunctionDeletes.length}`);
  for (const ref of orphanJunctionDeletes) console.log(`- ${ref.path}`);
  console.log(`Orphan user-document deletes: ${orphanUserDocumentDeletes.length}`);
  for (const ref of orphanUserDocumentDeletes) console.log(`- ${ref.path}`);

  if (errors.length > 0) {
    console.error(`Preflight failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`- ${error}`);
    throw new Error("Migration preflight failed; no data was written");
  }
  if (!applyChanges) {
    console.log("Dry run complete. Re-run with --apply during a maintenance window.");
    return;
  }

  const writer = new BatchedWriter();
  const descendantCounts = new Map<string, number>();

  for (const plan of entities) {
    if (!plan.needsWrite) continue;
    const destination = db.collection(entityLabel(plan.kind)).doc(plan.newId);
    const novelSource = plan.kind === "novel" ? plan.sourceRefs[0] : undefined;
    if (novelSource && novelSource.id !== plan.newId) {
      const count = await copyDocumentTree(novelSource, destination, plan.data, writer);
      descendantCounts.set(novelSource.path, count);
    } else {
      await writer.set(destination, plan.data);
    }
  }
  for (const write of dependentWrites) {
    if (write.needsWrite) await writer.set(write.destination, write.data);
  }
  await writer.flush();

  await verifyDestinations(entities, dependentWrites, descendantCounts);

  for (const source of entityDeletes) {
    if (source.kind === "novel") await deleteDocumentTree(source.ref, writer);
    else await writer.delete(source.ref);
  }
  for (const ref of dependentDeletes) await writer.delete(ref);
  for (const ref of orphanDeletes) await writer.delete(ref);
  await writer.flush();

  await verifyCleanup([
    ...entityDeletes.map((source) => source.ref),
    ...dependentDeletes,
    ...orphanDeletes,
  ]);

  console.log("Migration complete and verified.");
}

try {
  await migrate();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
