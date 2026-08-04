import { toVietnameseSlug } from "./slug.js";

export type SlugEntityKind = "novel" | "author" | "genre";

export interface SlugEntityRecord {
  id: string;
  data: Record<string, unknown>;
}

export interface SlugEntityPlan {
  kind: SlugEntityKind;
  newId: string;
  data: Record<string, unknown>;
  sourceIds: string[];
  merged: boolean;
  retainedUuid: boolean;
  needsWrite: boolean;
}

export interface SlugEntityPlanningResult {
  plans: SlugEntityPlan[];
  resolver: Map<string, string>;
  errors: string[];
}

function collectionName(kind: SlugEntityKind): string {
  return kind === "novel" ? "novels" : kind === "author" ? "authors" : "genres";
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function mergeIntoCanonical(
  canonical: SlugEntityRecord,
  sources: SlugEntityRecord[],
  slug: string,
): Record<string, unknown> {
  const merged = { ...canonical.data };
  for (const source of sources.filter((item) => item.id !== canonical.id)) {
    for (const [field, value] of Object.entries(source.data)) {
      if (isBlank(merged[field]) && !isBlank(value)) merged[field] = value;
    }
  }
  merged.slug = slug;
  return merged;
}

export function planSlugEntities(
  kind: SlugEntityKind,
  sourceField: "title" | "name",
  records: SlugEntityRecord[],
): SlugEntityPlanningResult {
  const collection = collectionName(kind);
  const errors: string[] = [];
  const resolver = new Map<string, string>();
  const candidates = new Map<string, SlugEntityRecord[]>();
  const retainedAuthorIds = new Set<string>();

  for (const record of records) {
    const source = record.data[sourceField];
    if (typeof source !== "string" || !source.trim()) {
      errors.push(`${collection}/${record.id}: ${sourceField} is missing`);
      continue;
    }

    let newId = toVietnameseSlug(source);
    if (!newId && kind === "author") {
      newId = record.id;
      retainedAuthorIds.add(record.id);
    } else if (!newId) {
      errors.push(`${collection}/${record.id}: ${sourceField} produces an empty slug`);
      continue;
    }

    const group = candidates.get(newId) ?? [];
    group.push(record);
    candidates.set(newId, group);
    resolver.set(record.id, newId);
    resolver.set(newId, newId);
  }

  const plans: SlugEntityPlan[] = [];
  for (const [newId, unsortedSources] of candidates) {
    const sources = [...unsortedSources].sort((a, b) => a.id.localeCompare(b.id));
    const sourceIds = sources.map((source) => source.id);

    if (sources.length === 1) {
      plans.push({
        kind,
        newId,
        data: { ...sources[0].data, slug: newId },
        sourceIds,
        merged: false,
        retainedUuid: retainedAuthorIds.has(sources[0].id),
        needsWrite: sources[0].id !== newId || sources[0].data.slug !== newId,
      });
      continue;
    }

    const canonical = sources.find((source) => source.id === newId);
    if (kind === "novel" || !canonical) {
      errors.push(
        `${collection}: slug collision "${newId}" from documents ${sourceIds.join(", ")}`,
      );
      continue;
    }

    plans.push({
      kind,
      newId,
      data: mergeIntoCanonical(canonical, sources, newId),
      sourceIds,
      merged: true,
      retainedUuid: false,
      needsWrite: true,
    });
  }

  return { plans, resolver, errors };
}
