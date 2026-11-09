export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export const PLAYBACK_RATE_STORAGE_KEY = "screen-record:playback-rate";

export function parsePlaybackRate(value: string | null | undefined): PlaybackRate {
  if (!value?.trim()) return DEFAULT_PLAYBACK_RATE;
  const n = Number(value);
  return PLAYBACK_RATES.find((rate) => rate === n) ?? DEFAULT_PLAYBACK_RATE;
}

export function formatPlaybackRate(rate: PlaybackRate): string {
  return `${rate}×`;
}

export function readStoredPlaybackRate(storage?: Pick<Storage, "getItem">): PlaybackRate {
  try {
    return parsePlaybackRate((storage ?? window.localStorage).getItem(PLAYBACK_RATE_STORAGE_KEY));
  } catch {
    return DEFAULT_PLAYBACK_RATE;
  }
}

export function writeStoredPlaybackRate(
  rate: PlaybackRate,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? window.localStorage).setItem(PLAYBACK_RATE_STORAGE_KEY, String(rate));
  } catch {
    // Storage can be unavailable (private mode, blocked third-party iframes).
  }
}
