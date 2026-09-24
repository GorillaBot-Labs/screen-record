import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { purgeLegacyRecentRecordingStore } from "./recent-recordings";

const storePath = path.join(homedir(), ".screen-record", "recent-recordings.json");

describe("purgeLegacyRecentRecordingStore", () => {
  afterEach(() => {
    try {
      if (existsSync(storePath)) unlinkSync(storePath);
    } catch {
      /* ignore */
    }
  });

  it("removes the legacy recent uploads file", () => {
    writeFileSync(
      storePath,
      JSON.stringify({
        entries: [
          {
            url: "https://storage.googleapis.com/screen-record/recording.mp4",
            title: "Old upload",
            recordedAt: "2024-06-15T12:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );

    purgeLegacyRecentRecordingStore();

    expect(existsSync(storePath)).toBe(false);
  });
});
