import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATE_STORAGE_KEY,
  PLAYBACK_RATES,
  formatPlaybackRate,
  parsePlaybackRate,
  readStoredPlaybackRate,
  writeStoredPlaybackRate,
} from "@/lib/playback-rate";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("parsePlaybackRate", () => {
  it("accepts every preset", () => {
    for (const rate of PLAYBACK_RATES) {
      expect(parsePlaybackRate(String(rate))).toBe(rate);
    }
  });

  it("defaults to 1× for missing or invalid values", () => {
    expect(DEFAULT_PLAYBACK_RATE).toBe(1);
    for (const value of [null, undefined, "", "  ", "fast", "3", "0", "-1", "1.1", "NaN"]) {
      expect(parsePlaybackRate(value)).toBe(1);
    }
  });
});

describe("formatPlaybackRate", () => {
  it("labels rates with a multiplication sign", () => {
    expect(formatPlaybackRate(0.75)).toBe("0.75×");
    expect(formatPlaybackRate(2)).toBe("2×");
  });
});

describe("readStoredPlaybackRate", () => {
  it("restores a stored preset", () => {
    expect(readStoredPlaybackRate(memoryStorage({ [PLAYBACK_RATE_STORAGE_KEY]: "1.5" }))).toBe(
      1.5,
    );
  });

  it("defaults to 1× when nothing or garbage is stored", () => {
    expect(readStoredPlaybackRate(memoryStorage())).toBe(1);
    expect(readStoredPlaybackRate(memoryStorage({ [PLAYBACK_RATE_STORAGE_KEY]: "{" }))).toBe(1);
  });

  it("defaults to 1× when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readStoredPlaybackRate(storage)).toBe(1);
  });
});

describe("writeStoredPlaybackRate", () => {
  it("stores the numeric rate under the shared key", () => {
    const storage = memoryStorage();
    writeStoredPlaybackRate(1.25, storage);
    expect(storage.items.get(PLAYBACK_RATE_STORAGE_KEY)).toBe("1.25");
    expect(readStoredPlaybackRate(storage)).toBe(1.25);
  });

  it("does not throw when storage is unavailable", () => {
    const storage = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writeStoredPlaybackRate(2, storage)).not.toThrow();
  });
});
