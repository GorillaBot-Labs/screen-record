"use client";

import { PlaybackSpeedSelect } from "@/app/(watch)/r/[id]/PlaybackSpeedSelect";
import { RecordingShareActions } from "@/app/(watch)/r/[id]/RecordingShareActions";
import {
  type RecordingCommentItem,
  RecordingViewer,
} from "@/app/(watch)/r/[id]/RecordingViewer";
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATE_STORAGE_KEY,
  type PlaybackRate,
  readStoredPlaybackRate,
  writeStoredPlaybackRate,
} from "@/lib/playback-rate";
import { type ReactNode, useCallback, useRef, useSyncExternalStore } from "react";

const rateListeners = new Set<() => void>();
let selectedRate: PlaybackRate | null = null;

function notifyRateListeners() {
  for (const listener of rateListeners) listener();
}

function subscribeToRate(listener: () => void) {
  rateListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PLAYBACK_RATE_STORAGE_KEY) return;
    selectedRate = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    rateListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getRateSnapshot(): PlaybackRate {
  return selectedRate ?? readStoredPlaybackRate();
}

function setPlaybackRate(rate: PlaybackRate) {
  selectedRate = rate;
  writeStoredPlaybackRate(rate);
  notifyRateListeners();
}

export function WatchRecording({
  recordingId,
  shareUrl,
  publicUrl,
  posterUrl,
  downloadFilename,
  initialComments,
  startAtSeconds,
  children,
}: {
  recordingId: string;
  shareUrl: string;
  publicUrl: string;
  posterUrl?: string | null;
  downloadFilename: string;
  initialComments: RecordingCommentItem[];
  startAtSeconds?: number;
  children: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRate = useSyncExternalStore(
    subscribeToRate,
    getRateSnapshot,
    () => DEFAULT_PLAYBACK_RATE,
  );

  const getPlayheadSeconds = useCallback(() => videoRef.current?.currentTime ?? 0, []);

  return (
    <>
      <header className="shrink-0 border-b border-border px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">{children}</div>
          <RecordingShareActions
            recordingId={recordingId}
            shareUrl={shareUrl}
            publicUrl={publicUrl}
            downloadFilename={downloadFilename}
            variant="watch"
            compact
            getPlayheadSeconds={getPlayheadSeconds}
          >
            <PlaybackSpeedSelect rate={playbackRate} onChange={setPlaybackRate} compact />
          </RecordingShareActions>
        </div>
      </header>
      <RecordingViewer
        recordingId={recordingId}
        publicUrl={publicUrl}
        posterUrl={posterUrl}
        initialComments={initialComments}
        startAtSeconds={startAtSeconds}
        videoRef={videoRef}
        playbackRate={playbackRate}
      />
    </>
  );
}
