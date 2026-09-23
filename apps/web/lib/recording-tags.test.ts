import { describe, expect, it } from "vitest";
import { normalizeTag, normalizeTags } from "@/lib/recording-tags";

describe("normalizeTag", () => {
  it("trims whitespace and collapses internal spaces", () => {
    expect(normalizeTag("  product   demo  ")).toBe("product demo");
  });

  it("rejects empty tags", () => {
    expect(normalizeTag("   ")).toBeNull();
  });

  it("rejects tags longer than 32 characters", () => {
    expect(normalizeTag("a".repeat(33))).toBeNull();
  });
});

describe("normalizeTags", () => {
  it("deduplicates tags case-insensitively", () => {
    expect(normalizeTags(["Demo", "demo", "DEMO"])).toEqual(["Demo"]);
  });

  it("caps the list at 20 tags", () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
    expect(normalizeTags(tags)).toHaveLength(20);
  });
});
