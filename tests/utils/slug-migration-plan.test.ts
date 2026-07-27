import { describe, expect, it } from "@jest/globals";
import { planSlugEntities } from "../../src/utils/slug-migration-plan.js";

describe("slug migration entity planning", () => {
  it("merges a malformed genre slug into the canonical slug document", () => {
    const result = planSlugEntities("genre", "name", [
      { id: "s-ng", data: { name: "Sủng", slug: "s-ng", description: "legacy" } },
      { id: "sung", data: { name: "Sủng", slug: "sung", description: "" } },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.resolver.get("s-ng")).toBe("sung");
    expect(result.plans).toEqual([
      expect.objectContaining({
        newId: "sung",
        sourceIds: ["s-ng", "sung"],
        merged: true,
        needsWrite: true,
        data: expect.objectContaining({ slug: "sung", description: "legacy" }),
      }),
    ]);
  });

  it("keeps canonical author metadata and only fills blank fields", () => {
    const result = planSlugEntities("author", "name", [
      {
        id: "uuid-author",
        data: { name: "Nguyễn Du", slug: "nguyen-du-cu", bio: "Legacy bio", avatar_url: "old" },
      },
      {
        id: "nguyen-du",
        data: { name: "Nguyễn Du", slug: "nguyen-du", bio: "Canonical bio", avatar_url: "" },
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.plans[0].data).toEqual(
      expect.objectContaining({
        name: "Nguyễn Du",
        slug: "nguyen-du",
        bio: "Canonical bio",
        avatar_url: "old",
      }),
    );
  });

  it("retains an author UUID when the name cannot produce an ASCII slug", () => {
    const result = planSlugEntities("author", "name", [
      { id: "jAgktDsMLjHwXQbspPkQ", data: { name: "金庸", slug: "" } },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.resolver.get("jAgktDsMLjHwXQbspPkQ")).toBe("jAgktDsMLjHwXQbspPkQ");
    expect(result.plans[0]).toEqual(
      expect.objectContaining({
        newId: "jAgktDsMLjHwXQbspPkQ",
        retainedUuid: true,
        needsWrite: true,
        data: expect.objectContaining({ slug: "jAgktDsMLjHwXQbspPkQ" }),
      }),
    );
  });

  it("keeps novel collisions strict", () => {
    const result = planSlugEntities("novel", "title", [
      { id: "uuid-novel", data: { title: "Đấu Phá" } },
      { id: "dau-pha", data: { title: "Đấu Phá", slug: "dau-pha" } },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.plans).toEqual([]);
  });

  it("rejects author collisions without an existing canonical slug document", () => {
    const result = planSlugEntities("author", "name", [
      { id: "uuid-1", data: { name: "Nguyễn Du" } },
      { id: "uuid-2", data: { name: "Nguyễn Du" } },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.plans).toEqual([]);
  });

  it("requires no write after an author UUID fallback has been applied", () => {
    const result = planSlugEntities("author", "name", [
      {
        id: "jAgktDsMLjHwXQbspPkQ",
        data: { name: "金庸", slug: "jAgktDsMLjHwXQbspPkQ" },
      },
    ]);

    expect(result.plans[0].needsWrite).toBe(false);
  });
});
