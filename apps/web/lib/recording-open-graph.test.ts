import { describe, expect, it } from "vitest";
import { buildRecordingOpenGraph } from "@/lib/recording-open-graph";

describe("buildRecordingOpenGraph", () => {
  it("builds open graph metadata for a recording share page", () => {
    const og = buildRecordingOpenGraph({
      recordingId: "abc123",
      title: "Quarterly review",
      notes: "Walkthrough for stakeholders",
      appBaseUrl: "https://recordings.example.com",
    });

    expect(og.title).toBe("Quarterly review");
    expect(og.description).toBe("Walkthrough for stakeholders");
    expect(og.url).toBe("https://recordings.example.com/r/abc123");
    expect(og.images[0]?.url).toBe(
      "https://recordings.example.com/r/abc123/opengraph-image",
    );
  });
});
