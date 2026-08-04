import { describe, expect, it } from "@jest/globals";
import { ValidationError } from "../../src/utils/errors.js";
import {
  assertImmutableSlug,
  requireVietnameseSlug,
  toVietnameseSlug,
} from "../../src/utils/slug.js";

describe("Vietnamese slug utility", () => {
  it.each([
    ["Đấu Phá Thương Khung", "dau-pha-thuong-khung"],
    ["  Nguyễn Nhật Ánh  ", "nguyen-nhat-anh"],
    ["TRUYỆN: Việt Nam!", "truyen-viet-nam"],
    ["Nguyễn Nhật Ánh", "nguyen-nhat-anh"],
    ["foo---bar", "foo-bar"],
  ])("converts %s", (input, expected) => {
    expect(toVietnameseSlug(input)).toBe(expected);
  });

  it("rejects an empty normalized slug", () => {
    expect(() => requireVietnameseSlug("---")).toThrow(ValidationError);
  });

  it("allows the current slug but rejects a rename", () => {
    expect(() => assertImmutableSlug("dau-pha", "Đấu Phá")).not.toThrow();
    expect(() => assertImmutableSlug("dau-pha", "Đấu La")).toThrow(ValidationError);
  });
});
