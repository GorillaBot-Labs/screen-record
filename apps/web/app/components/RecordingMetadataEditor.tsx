"use client";

import { updateRecordingMetadata } from "@/app/actions/update-recording-metadata";
import { displayTitle } from "@/lib/recording-display";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type RecordingMetadataEditorProps = {
  recordingId: string;
  title: string | null;
  gcsObjectName: string;
  notes: string | null;
};

export function RecordingMetadataEditor({
  recordingId,
  title,
  gcsObjectName,
  notes,
}: RecordingMetadataEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? displayTitle({ title, gcsObjectName }));
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);

  const displayedTitle = displayTitle({ title, gcsObjectName });

  const startEditing = useCallback(() => {
    setDraftTitle(title ?? displayedTitle);
    setDraftNotes(notes ?? "");
    setEditing(true);
  }, [title, notes, displayedTitle]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setDraftTitle(title ?? displayedTitle);
    setDraftNotes(notes ?? "");
  }, [title, notes, displayedTitle]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await updateRecordingMetadata(recordingId, {
        title: draftTitle,
        notes: draftNotes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Recording updated");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [recordingId, draftTitle, draftNotes, router]);

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex max-w-full items-center gap-2">
          <button
            type="button"
            onClick={startEditing}
            className="group/title min-w-0 text-left"
            aria-label={`Edit “${displayedTitle}”`}
          >
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground transition-colors group-hover/title:text-accent group-focus-visible/title:text-accent md:text-2xl group-hover/title:underline group-focus-visible/title:underline">
              {displayedTitle}
            </h1>
          </button>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:bg-accent-soft focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            aria-label="Edit title and description"
          >
            <Pencil className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        {notes?.trim() ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{notes.trim()}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Title</span>
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 focus:ring-2"
          maxLength={120}
          autoFocus
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Description</span>
        <textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 focus:ring-2"
          maxLength={2000}
          placeholder="Add context for viewers…"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !draftTitle.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={saving}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
