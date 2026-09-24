"use client";

import { deleteRecordingViaApi } from "@/lib/recording-delete-api";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { RecordingTags } from "@/app/components/RecordingTags";
import {
  asDate,
  displayTitle,
  relativeTime,
} from "@/lib/recording-display";
import type { LibraryRecording } from "@/lib/library-types";
import { formatVideoTimestamp } from "@/lib/video-time";
import { Link2, MessageSquare, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

type RecordingCardProps = {
  recording: LibraryRecording;
  selected?: boolean;
  onSelectedChange?: (id: string, selected: boolean) => void;
  onTagClick?: (tag: string) => void;
  draggable?: boolean;
};

export function RecordingCard({
  recording,
  selected = false,
  onSelectedChange,
  onTagClick,
  draggable = false,
}: RecordingCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: recording.id,
    disabled: !draggable,
    data: { type: "recording" },
  });

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const draggedRef = useRef(false);

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const blockNavigationAfterDrag = useCallback((event: React.MouseEvent) => {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  }, []);

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

  const openDeleteDialog = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleting(true);
    try {
      const result = await deleteRecordingViaApi(recording.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Recording deleted");
      setDeleteOpen(false);
      router.refresh();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [recording.id, router]);

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClickCapture={draggable ? blockNavigationAfterDrag : undefined}
      className={`group flex flex-col gap-2.5 touch-none ${
        selected ? "rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-background" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "z-10 opacity-60" : ""
      }`}
    >
      <div className="relative overflow-hidden rounded-xl bg-zinc-950">
        {onSelectedChange ? (
          <label className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/95 shadow-sm">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectedChange(recording.id, e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent-muted"
              aria-label={`Select ${name}`}
            />
          </label>
        ) : null}

        <Link
          href={sharePagePath}
          onClick={draggable ? blockNavigationAfterDrag : undefined}
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

        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5">
          {recording.durationSeconds != null && recording.durationSeconds > 0 ? (
            <span className="rounded-md bg-zinc-950/80 px-1.5 py-0.5 font-mono text-xs font-medium text-white">
              {formatVideoTimestamp(recording.durationSeconds)}
            </span>
          ) : null}
          {recording.commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-xs font-medium text-white">
              <MessageSquare className="h-3 w-3 opacity-80" aria-hidden />
              {recording.commentCount}
            </span>
          ) : null}
        </div>

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
            onClick={openDeleteDialog}
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-danger shadow-sm transition-colors hover:bg-white disabled:opacity-50"
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete recording?"
        description="This removes the file from cloud storage and the catalog. You cannot undo this."
        detail={name}
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteOpen(false)}
      />

      <div className="min-w-0 px-0.5">
        <h2 className="truncate text-sm font-medium text-foreground" title={name}>
          <Link
            href={sharePagePath}
            onClick={draggable ? blockNavigationAfterDrag : undefined}
            className="hover:text-accent"
          >
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
        <RecordingTags
          recordingId={recording.id}
          tags={recording.tags}
          compact
          onTagClick={onTagClick}
        />
      </div>
    </article>
  );
}
