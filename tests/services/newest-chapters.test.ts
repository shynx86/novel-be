import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { listNewestChapters } from "../../src/services/chapter.js";
import { mockCollectionGroup, mockGetAll, mockQueryGet } from "../__mocks__/firebase-admin.js";

const chapterSnapshot = (novelId: string, index: number, updatedAt: string) => ({
  ref: { parent: { parent: { id: novelId } } },
  data: () => ({
    index,
    title: `Chapter ${index}`,
    access_type: "free",
    price: 0,
    updated_at: updatedAt,
  }),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listNewestChapters", () => {
  it("uses one collection-group query and omits draft novels", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [
        chapterSnapshot("published-novel", 5, "2026-07-19T00:00:00.000Z"),
        chapterSnapshot("draft-novel", 4, "2026-07-18T00:00:00.000Z"),
      ],
    });
    mockGetAll.mockResolvedValue([
      {
        exists: true,
        id: "published-novel",
        data: () => ({
          slug: "published-novel",
          title: "Published Novel",
          publication_status: "published",
        }),
      },
      {
        exists: true,
        id: "draft-novel",
        data: () => ({
          slug: "draft-novel",
          title: "Draft Novel",
          publication_status: "draft",
        }),
      },
    ]);

    const result = await listNewestChapters(10);

    expect(mockCollectionGroup).toHaveBeenCalledWith("chapters");
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        novel_id: "published-novel",
        novel_title: "Published Novel",
        index: 5,
      }),
    ]);
  });

  it("filters results by novel title when searching", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [chapterSnapshot("novel-1", 1, "2026-07-19T00:00:00.000Z")],
    });
    mockGetAll.mockResolvedValue([
      {
        exists: true,
        id: "novel-1",
        data: () => ({
          slug: "novel-1",
          title: "A Space Opera",
          publication_status: "published",
        }),
      },
    ]);

    expect(await listNewestChapters(10, "mystery")).toEqual([]);
  });
});
