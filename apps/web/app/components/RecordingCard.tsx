"use client";

import type { Recording } from "@prisma/client";
import { ExternalLink, Link2 } from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

function displayName(recording: Pick<Recording, "title" | "gcsObjectName">) {
  const t = recording.title?.trim();
  if (t) return t;
  const base = recording.gcsObjectName.split("/").pop() ?? recording.gcsObjectName;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** RSC → client props serialize `Date` as ISO strings. */
function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function RecordingCard({ recording }: { recording: Recording }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const copyPublicUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recording.publicUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  }, [recording.publicUrl]);

  const name = displayName(recording);
  const createdAt = asDate(recording.createdAt);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm shadow-stone-900/5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
      <div className="aspect-video bg-zinc-950">
        <video
          ref={videoRef}
          className="h-full w-full cursor-pointer object-contain outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 dark:focus-visible:ring-zinc-500"
          playsInline
          preload="metadata"
          src={recording.publicUrl}
          disablePictureInPicture
          tabIndex={0}
          aria-label={`Video: ${name}. Click to play or pause.`}
          onClick={togglePlayback}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              togglePlayback();
            }
          }}
        >
          Your browser does not support embedded video.
        </video>
      </div>
      <div className="flex flex-col gap-1 border-t border-stone-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="truncate text-sm font-semibold text-stone-900 dark:text-zinc-50" title={name}>
          {name}
        </h2>
        <time
          className="text-xs text-stone-500 dark:text-zinc-400"
          dateTime={createdAt.toISOString()}
        >
          {dateFormatter.format(createdAt)}
        </time>
        {recording.notes?.trim() ? (
          <p className="line-clamp-2 text-xs text-stone-600 dark:text-zinc-400">{recording.notes.trim()}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <a
            href={recording.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Open in new tab
          </a>
          <button
            type="button"
            onClick={copyPublicUrl}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-700 transition-colors hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            aria-label="Copy video URL to clipboard"
          >
            <Link2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}
