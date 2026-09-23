import { describe, expect, it } from "vitest";
import { recordingElapsedSeconds } from "./recording-duration";

describe("recordingElapsedSeconds", () => {
  it("subtracts paused time from elapsed duration", () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 0,
        endedAtMs: 65_000,
        pausedTotalMs: 15_000,
      }),
    ).toBe(50);
  });

  it("includes an active pause interval in the elapsed duration", () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 0,
        endedAtMs: 40_000,
        pausedAtMs: 30_000,
      }),
    ).toBe(30);
  });
});
