"use client";

import { deleteRecordings } from "@/app/actions/delete-recordings";
import { moveRecording } from "@/app/actions/projects";
import { RecordingCard } from "@/app/components/RecordingCard";
import {
  collectLibraryTags,
  filterLibraryRecordings,
  sortLibraryRecordings,
} from "@/lib/library-filter";
import {
  type LibraryRecording,
  type LibrarySort,
} from "@/lib/library-types";
import { EmptyPlaceholder } from "@/app/components/EmptyPlaceholder";
import { LibraryToolbar } from "@/app/components/LibraryToolbar";
import {
  ProjectFolderStrip,
  type ProjectFolderItem,
} from "@/app/components/ProjectFolderStrip";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Folder, FolderOpen, SearchX, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type LibraryViewProps = {
  recordings: LibraryRecording[];
  projectId?: string | null;
  folderId?: string | null;
  folders?: ProjectFolderItem[];
};

export function LibraryView({
  recordings,
  projectId = null,
  folderId = null,
  folders = [],
}: LibraryViewProps) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const [movingRecordingId, setMovingRecordingId] = useState<string | null>(null);
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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !projectId) return;

      const overData = over.data.current;
      if (overData?.type !== "folder") return;

      const recordingId = String(active.id);
      const targetFolderId = overData.folderId as string | null;
      const recording = recordings.find((item) => item.id === recordingId);
      if (!recording || recording.folderId === targetFolderId) return;

      setMovingRecordingId(recordingId);
      try {
        const result = await moveRecording({
          recordingId,
          projectId,
          folderId: targetFolderId,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(targetFolderId ? "Moved to folder" : "Moved to project root");
        router.refresh();
      } catch {
        toast.error("Could not move recording");
      } finally {
        setMovingRecordingId(null);
      }
    },
    [projectId, recordings, router],
  );

  const inProjectContext = Boolean(projectId);
  const hasFolders = folders.length > 0;
  const showFolderStrip = inProjectContext && (hasFolders || Boolean(folderId));
  const canDragRecordings = inProjectContext;

  const hasActiveFilters = Boolean(query.trim() || tagFilter || hasCommentsOnly);
  const resultLabel =
    hasActiveFilters || visible.length !== recordings.length
      ? `${visible.length} of ${recordings.length} video${recordings.length === 1 ? "" : "s"}`
      : undefined;

  const searchAndFilters = (
    <LibraryToolbar
      query={query}
      onQueryChange={setQuery}
      sort={sort}
      onSortChange={setSort}
      tags={allTags}
      tagFilter={tagFilter}
      onTagFilterChange={setTagFilter}
      hasCommentsOnly={hasCommentsOnly}
      onHasCommentsOnlyChange={setHasCommentsOnly}
      resultLabel={resultLabel}
    />
  );

  const folderStripSection = showFolderStrip ? (
    <ProjectFolderStrip
      projectId={projectId!}
      folders={folders}
      activeFolderId={folderId}
      showProjectRootDrop={Boolean(folderId)}
    />
  ) : null;

  const selectionBar =
    selected.size > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent-muted bg-accent-soft px-3 py-2">
        <p className="text-sm font-medium text-accent">
          {selected.size} selected
          {selectedVisibleCount < selected.size
            ? ` · ${selected.size - selectedVisibleCount} hidden by filters`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {visible.length > 0 ? (
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-background/60"
            >
              Select all
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-background/60"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1 rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {bulkDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    ) : null;

  const content = (() => {
  if (!inProjectContext && recordings.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {searchAndFilters}
        <EmptyPlaceholder
          icon={Video}
          title="No recordings yet"
          description="Record from the Screen Record app to get started."
        />
      </div>
    );
  }

  if (inProjectContext && recordings.length === 0 && !hasFolders) {
    return (
      <div className="flex flex-col gap-3">
        {searchAndFilters}
        {folderStripSection}
        {selectionBar}
        <EmptyPlaceholder
          icon={folderId ? Folder : FolderOpen}
          title={folderId ? "Empty folder" : "Nothing here yet"}
          description={
            folderId
              ? "Move recordings here to organize them."
              : "Recordings at the project root will show up here."
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {searchAndFilters}
      {folderStripSection}
      {selectionBar}

      {visible.length === 0 ? (
        <EmptyPlaceholder
          icon={recordings.length === 0 ? FolderOpen : SearchX}
          title={recordings.length === 0 ? "No videos here" : "No results"}
          description={
            recordings.length === 0
              ? "Drag videos from another folder or add new recordings."
              : "Try a different search or filter."
          }
          compact={recordings.length === 0 && hasFolders}
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
                draggable={canDragRecordings && movingRecordingId !== recording.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  })();

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
      {content}
    </DndContext>
  );
}
