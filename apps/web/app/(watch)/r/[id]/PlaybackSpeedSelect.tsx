"use client";

import { shareActionButtonClass } from "@/app/(watch)/r/[id]/RecordingShareActions";
import {
  PLAYBACK_RATES,
  type PlaybackRate,
  formatPlaybackRate,
  parsePlaybackRate,
} from "@/lib/playback-rate";
import { Gauge } from "lucide-react";

export function PlaybackSpeedSelect({
  rate,
  onChange,
  compact = false,
}: {
  rate: PlaybackRate;
  onChange: (rate: PlaybackRate) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`${shareActionButtonClass(compact)} border border-border bg-background text-foreground hover:bg-surface has-[select:focus-visible]:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--accent-muted)]`}
    >
      <Gauge className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span>Speed</span>
      <select
        aria-label="Playback speed"
        value={String(rate)}
        onChange={(e) => onChange(parsePlaybackRate(e.target.value))}
        className="cursor-pointer bg-transparent font-medium tabular-nums text-foreground focus-visible:shadow-none!"
      >
        {PLAYBACK_RATES.map((option) => (
          <option key={option} value={String(option)}>
            {formatPlaybackRate(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
