import { describe, expect, it } from "vitest";
import { buildEmbedHtml, buildRecordingShareUrl } from "@/lib/share-links";

describe("buildRecordingShareUrl", () => {
  it("builds an absolute share URL from a recording id", () => {
    expect(buildRecordingShareUrl("abc123", "https://recordings.example.com")).toBe(
      "https://recordings.example.com/r/abc123",
    );
  });
});

describe("buildEmbedHtml", () => {
  it("returns an iframe snippet for the share page", () => {
    expect(buildEmbedHtml("https://recordings.example.com/r/abc123")).toContain(
      '<iframe src="https://recordings.example.com/r/abc123"',
    );
  });
});
