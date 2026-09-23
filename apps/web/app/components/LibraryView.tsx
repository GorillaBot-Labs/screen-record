"use client";

import { deleteRecordings } from "@/app/actions/delete-recordings";
import { RecordingCard } from "@/app/components/RecordingCard";
import {
  collectLibraryTags,
  filterLibraryRecordings,
  sortLibraryRecordings,
} from "@/lib/library-filter";
import {
  LIBRARY_SORT_LABELS,
  type LibraryRecording,
  type LibrarySort,
} from "@/lib/library-types";
import { EmptyPlaceholder } from "@/app/components/EmptyPlaceholder";
import { Folder, FolderOpen, Search, SearchX, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type LibraryViewProps = {
  recordings: LibraryRecording[];
  projectId?: string | null;
  folderId?: string | null;
};

export function LibraryView({
  recordings,
  projectId = null,
  folderId = null,
}: LibraryViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [hasCommentsOnly, setHasCommentsOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allTags = useMemo(() => collectLibraryTags(recordings), [recordings]);

  const visible = useMemo(() => {
    const filtered = filterLibraryRecordings(recordings, {
      query,
      tag: tagFilter,
      hasComments: hasCommentsOnly,
      projectId,
      folderId,
    });
    return sortLibraryRecordings(filtered, sort);
  }, [recordings, query, sort, tagFilter, hasCommentsOnly, projectId, folderId]);

  const selectedVisibleCount = useMemo(
    () => visible.filter((r) => selected.has(r.id)).length,
    [visible, selected],
  );

  const toggleSelected = useCallback((id: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(visible.map((r) => r.id)));
  }, [visible]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} recording${ids.length === 1 ? "" : "s"}? This removes files from cloud storage and the catalog. You cannot undo this.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const result = await deleteRecordings(ids);
      if (!result.ok) {
        toast.error(result.error);
        if (result.deletedIds.length > 0) {
          setSelected((prev) => {
            const copy = new Set(prev);
            for (const id of result.deletedIds) copy.delete(id);
            return copy;
          });
          router.refresh();
        }
        return;
      }
      toast.success(`Deleted ${result.deleted} recording${result.deleted === 1 ? "" : "s"}`);
      clearSelection();
      router.refresh();
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  }, [clearSelection, router, selected]);

  const handleTagClick = useCallback((tag: string) => {
    setTagFilter((current) => (current?.toLowerCase() === tag.toLowerCase() ? null : tag));
  }, []);

  if (recordings.length === 0) {
    if (folderId) {
      return (
        <EmptyPlaceholder
          icon={Folder}
          title="Empty folder"
          description="Move recordings here to organize them."
        />
      );
    }
    if (projectId) {
      return (
        <EmptyPlaceholder
          icon={FolderOpen}
          title="Nothing here yet"
          description="Recordings in this project will show up here."
        />
      );
    }
    return (
      <EmptyPlaceholder
        icon={Video}
        title="No recordings yet"
        description="Record from the Screen Record app to get started."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3 md:p-3.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, filename, date, tags, or notes…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-accent-muted focus:ring-2 focus:ring-accent-soft"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as LibrarySort)}
            aria-label="Sort recordings"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-muted focus:ring-2 focus:ring-accent-soft sm:w-44"
          >
            {(Object.keys(LIBRARY_SORT_LABELS) as LibrarySort[]).map((key) => (
              <option key={key} value={key}>
                {LIBRARY_SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {allTags.length > 0 || hasCommentsOnly ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                tagFilter === null
                  ? "bg-accent-soft text-accent"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              All tags
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTagFilter((current) =>
                    current?.toLowerCase() === tag.toLowerCase() ? null : tag,
                  )
                }
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  tagFilter?.toLowerCase() === tag.toLowerCase()
                    ? "bg-accent-soft text-accent"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={hasCommentsOnly}
                onChange={(e) => setHasCommentsOnly(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent-muted"
              />
              Has comments
            </label>
          </div>
        ) : (
          <label className="inline-flex items-center gap-1.5 border-t border-border pt-2.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={hasCommentsOnly}
              onChange={(e) => setHasCommentsOnly(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent-muted"
            />
            Has comments
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {visible.length} of {recordings.length} video{recordings.length === 1 ? "" : "s"}
          {selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {visible.length > 0 ? (
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              Select all shown
            </button>
          ) : null}
          {selected.size > 0 ? (
            <>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {bulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyPlaceholder
          icon={SearchX}
          title="No results"
          description="Try a different search or filter."
        />
      ) : (
        <ul className="grid list-none grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((recording) => (
            <li key={recording.id}>
              <RecordingCard
                recording={recording}
                selected={selected.has(recording.id)}
                onSelectedChange={toggleSelected}
                onTagClick={handleTagClick}
              />
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 && selectedVisibleCount < selected.size ? (
        <p className="text-xs text-muted">
          {selected.size - selectedVisibleCount} selected item
          {selected.size - selectedVisibleCount === 1 ? "" : "s"} hidden by current filters.
        </p>
      ) : null}
    </div>
  );
}
