import { describe, expect, it } from "vitest";
import { posterObjectNameForRecording } from "@/lib/poster-object";

describe("posterObjectNameForRecording", () => {
  it("derives a jpeg key beside the mp4", () => {
    expect(posterObjectNameForRecording("recordings/recording_2024.mp4")).toBe(
      "recordings/recording_2024.poster.jpg",
    );
  });

  it("rejects keys outside the recordings prefix", () => {
    expect(() => posterObjectNameForRecording("other/clip.mp4")).toThrow(
      "Invalid recording object name",
    );
  });
});
