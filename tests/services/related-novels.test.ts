import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publicFilterKey } from "../../src/services/novel-list-index.js";
import { getRelatedNovels } from "../../src/services/novel.js";
import {
  mockGetAll,
  mockQueryGet,
  mockQueryLimit,
  mockQueryWhere,
} from "../__mocks__/firebase-admin.js";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getRelatedNovels", () => {
  it("queries a bounded page of public novels instead of fetching every genre relation", async () => {
    mockQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => ({ genre_id: "fantasy" }) }] })
      .mockResolvedValueOnce({
        docs: [
          { id: "current", data: () => ({ title: "Current", publication_status: "public" }) },
          { id: "related", data: () => ({ title: "Related", publication_status: "public" }) },
        ],
      });

    const result = await getRelatedNovels("current", 0, 1);

    expect(result.map((novel) => novel.id)).toEqual(["related"]);
    expect(mockQueryWhere).toHaveBeenCalledWith(
      "public_filter_keys",
      "array-contains",
      publicFilterKey({ genreId: "fantasy" }),
    );
    expect(mockQueryLimit).toHaveBeenCalledWith(20);
    expect(mockGetAll).not.toHaveBeenCalled();
  });
});
