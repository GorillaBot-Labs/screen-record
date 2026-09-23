import { describe, expect, it } from "vitest";
import { normalizeRecordingNotes, normalizeRecordingTitle } from "@/lib/recording-metadata";

describe("normalizeRecordingTitle", () => {
  it("trims whitespace and rejects empty titles", () => {
    expect(normalizeRecordingTitle("  Quarterly review  ")).toBe("Quarterly review");
    expect(normalizeRecordingTitle("   ")).toBeNull();
  });

  it("rejects titles longer than 120 characters", () => {
    expect(normalizeRecordingTitle("a".repeat(121))).toBeNull();
  });
});

describe("normalizeRecordingNotes", () => {
  it("trims notes and allows clearing to empty", () => {
    expect(normalizeRecordingNotes("  Walkthrough for stakeholders  ")).toBe(
      "Walkthrough for stakeholders",
    );
    expect(normalizeRecordingNotes("   ")).toBe("");
  });

  it("rejects notes longer than 2000 characters", () => {
    expect(normalizeRecordingNotes("a".repeat(2001))).toBeNull();
  });
});
