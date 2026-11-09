import { describe, expect, it } from "vitest";
import {
  buildEmbedHtml,
  buildRecordingShareUrl,
  buildTimestampedShareUrl,
} from "@/lib/share-links";

describe("buildRecordingShareUrl", () => {
  it("builds an absolute share URL from a recording id", () => {
    expect(buildRecordingShareUrl("abc123", "https://recordings.example.com")).toBe(
      "https://recordings.example.com/r/abc123",
    );
  });
});

describe("buildTimestampedShareUrl", () => {
  it("floors the playhead to whole seconds", () => {
    expect(buildTimestampedShareUrl("https://example.com/r/abc", 42.9)).toBe(
      "https://example.com/r/abc?t=42",
    );
  });

  it("uses t=0 at the start", () => {
    expect(buildTimestampedShareUrl("https://example.com/r/abc", 0)).toBe(
      "https://example.com/r/abc?t=0",
    );
  });

  it("clamps a negative playhead to zero", () => {
    expect(buildTimestampedShareUrl("https://example.com/r/abc", -3.5)).toBe(
      "https://example.com/r/abc?t=0",
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
