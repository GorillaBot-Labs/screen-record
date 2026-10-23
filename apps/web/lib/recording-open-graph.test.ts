import { describe, expect, it } from "vitest";
import { buildRecordingOpenGraph } from "@/lib/recording-open-graph";

describe("buildRecordingOpenGraph", () => {
  it("builds open graph metadata for a recording share page", () => {
    const og = buildRecordingOpenGraph({
      recordingId: "abc123",
      title: "Quarterly review",
      notes: "Walkthrough for stakeholders",
      appBaseUrl: "https://recordings.example.com",
      publicUrl: "https://storage.example.com/recordings/review.mp4",
    });

    expect(og.title).toBe("Quarterly review");
    expect(og.description).toBe("Walkthrough for stakeholders");
    expect(og.url).toBe("https://recordings.example.com/r/abc123");
    expect(og.images[0]?.url).toBe(
      "https://recordings.example.com/r/abc123/opengraph-image",
    );
    expect(og.videos[0]).toEqual({
      url: "https://storage.example.com/recordings/review.mp4",
      type: "video/mp4",
    });
  });

  it("uses an uploaded poster as the preview image when one exists", () => {
    const og = buildRecordingOpenGraph({
      recordingId: "abc123",
      title: "Quarterly review",
      notes: null,
      appBaseUrl: "https://recordings.example.com",
      publicUrl: "https://storage.example.com/recordings/review.mp4",
      posterUrl: "https://storage.example.com/recordings/review.poster.jpg",
    });

    expect(og.images).toEqual([
      {
        url: "https://storage.example.com/recordings/review.poster.jpg",
        alt: "Quarterly review",
      },
    ]);
  });
});
