"use client";

import { updateRecordingTags } from "@/app/actions/update-recording-tags";
import { normalizeTag } from "@/lib/recording-tags";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

type RecordingTagsProps = {
  recordingId: string;
  tags: string[];
  compact?: boolean;
  onTagClick?: (tag: string) => void;
};

export function RecordingTags({
  recordingId,
  tags,
  compact = false,
  onTagClick,
}: RecordingTagsProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const persistTags = useCallback(
    async (nextTags: string[]) => {
      setPending(true);
      try {
        const result = await updateRecordingTags(recordingId, nextTags);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        router.refresh();
        return true;
      } catch {
        toast.error("Could not update tags");
        return false;
      } finally {
        setPending(false);
      }
    },
    [recordingId, router],
  );

  const removeTag = useCallback(
    async (tag: string) => {
      await persistTags(tags.filter((t) => t !== tag));
    },
    [persistTags, tags],
  );

  const addTag = useCallback(async () => {
    const tag = normalizeTag(draft);
    if (!tag) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      toast.error("Tag already exists");
      return;
    }
    const ok = await persistTags([...tags, tag]);
    if (ok) {
      setDraft("");
      setAdding(false);
    }
  }, [draft, persistTags, tags]);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-1.5"}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-surface px-1.5 py-0.5 text-xs text-foreground"
        >
          {onTagClick ? (
            <button
              type="button"
              onClick={() => onTagClick(tag)}
              className="truncate hover:text-accent"
            >
              {tag}
            </button>
          ) : (
            <span className="truncate">{tag}</span>
          )}
          <button
            type="button"
            onClick={() => void removeTag(tag)}
            disabled={pending}
            className="shrink-0 rounded p-0.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}

      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTag();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onBlur={() => {
              if (draft.trim()) void addTag();
              else setAdding(false);
            }}
            disabled={pending}
            placeholder="Tag name"
            className="w-24 rounded-md border border-border bg-background px-2 py-0.5 text-xs outline-none focus:border-accent-muted focus:ring-1 focus:ring-accent-soft"
            autoFocus
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-accent-muted hover:text-accent disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Tag
        </button>
      )}
    </div>
  );
}
