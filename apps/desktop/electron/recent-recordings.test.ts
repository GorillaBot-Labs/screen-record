import { describe, expect, it } from "vitest";
import { buildRecentEntries } from "./recent-recordings";

describe("buildRecentEntries", () => {
  it("keeps the most recent uploads with titles and dedupes by url", () => {
    const existing = [
      {
        url: "https://example.com/r/old",
        title: "Old recording",
        recordedAt: "2024-06-14T12:00:00.000Z",
      },
    ];

    expect(
      buildRecentEntries(existing, {
        url: "https://example.com/r/abc",
        title: "Quarterly review",
        recordedAt: "2024-06-15T12:00:00.000Z",
      }),
    ).toEqual([
      {
        url: "https://example.com/r/abc",
        title: "Quarterly review",
        recordedAt: "2024-06-15T12:00:00.000Z",
      },
      {
        url: "https://example.com/r/old",
        title: "Old recording",
        recordedAt: "2024-06-14T12:00:00.000Z",
      },
    ]);
  });
});
