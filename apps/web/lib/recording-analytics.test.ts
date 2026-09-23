import { describe, expect, it } from "vitest";
import { formatViewStats } from "@/lib/recording-analytics";

describe("formatViewStats", () => {
  it("describes view count and last viewed time", () => {
    expect(formatViewStats({ viewCount: 0, lastViewedAt: null })).toBe("No views yet");

    const lastViewedAt = new Date("2024-06-15T18:00:00.000Z");
    const text = formatViewStats({ viewCount: 3, lastViewedAt });
    expect(text).toContain("3 views");
    expect(text).toContain("Last watched");
  });
});
