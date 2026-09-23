export function recordingElapsedSeconds(input: {
  startedAtMs: number;
  endedAtMs: number;
  pausedTotalMs?: number;
  pausedAtMs?: number | null;
}): number {
  const pauseExtra =
    input.pausedAtMs != null ? input.endedAtMs - input.pausedAtMs : 0;
  const elapsedMs = Math.max(
    0,
    input.endedAtMs - input.startedAtMs - (input.pausedTotalMs ?? 0) - pauseExtra,
  );
  return Math.round((elapsedMs / 1000) * 10) / 10;
}
