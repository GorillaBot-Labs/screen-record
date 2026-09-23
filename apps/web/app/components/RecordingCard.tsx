"use client";

import type { Recording } from "@prisma/client";
import { deleteRecording } from "@/app/actions/delete-recording";
import {
  asDate,
  displayTitle,
  relativeTime,
} from "@/lib/recording-display";
import { Link2, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function RecordingCard({ recording }: { recording: Recording }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const sharePagePath = `/r/${recording.id}`;
  const name = displayTitle(recording);
  const createdAt = asDate(recording.createdAt);

  const copyShareLink = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const shareUrl = `${window.location.origin}${sharePagePath}`;
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Share link copied");
      } catch {
        toast.error("Could not copy link");
      }
    },
    [sharePagePath],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !window.confirm(
          `Delete "${name}"? This removes the file from cloud storage and the catalog. You cannot undo this.`,
        )
      ) {
        return;
      }
      setDeleting(true);
      try {
        const result = await deleteRecording(recording.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Recording deleted");
        router.refresh();
      } catch {
        toast.error("Delete failed");
      } finally {
        setDeleting(false);
      }
    },
    [name, recording.id, router],
  );

  return (
    <article className="group flex flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-xl bg-zinc-950">
        <Link
          href={sharePagePath}
          className="relative block outline-none"
          aria-label={`Open recording: ${name}`}
        >
          <div className="aspect-video">
            <video
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              playsInline
              preload="metadata"
              src={recording.publicUrl}
              disablePictureInPicture
              tabIndex={-1}
              aria-hidden
            >
              Your browser does not support embedded video.
            </video>
          </div>
          <span className="pointer-events-none absolute inset-0 bg-zinc-950/0 transition-colors duration-200 group-hover:bg-zinc-950/20" />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md shadow-zinc-950/20">
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
            </span>
          </span>
        </Link>
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={copyShareLink}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-zinc-700 shadow-sm transition-colors hover:bg-white"
            aria-label="Copy share link"
          >
            <Link2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-danger shadow-sm transition-colors hover:bg-white disabled:opacity-50"
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-w-0 px-0.5">
        <h2 className="truncate text-sm font-medium text-foreground" title={name}>
          <Link href={sharePagePath} className="hover:text-accent">
            {name}
          </Link>
        </h2>
        <time
          className="mt-0.5 block text-xs text-muted"
          dateTime={createdAt.toISOString()}
          title={createdAt.toLocaleString()}
        >
          {relativeTime(createdAt)}
        </time>
      </div>
    </article>
  );
}
