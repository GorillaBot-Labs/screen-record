import { displayTitle } from "@/lib/recording-display";
import type { LibraryRecording, LibrarySort } from "@/lib/library-types";

function recordingSearchText(recording: LibraryRecording): string {
  const title = displayTitle(recording);
  const filename = recording.gcsObjectName.split("/").pop() ?? "";
  const date = new Date(recording.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const tags = recording.tags.join(" ");
  const notes = recording.notes?.trim() ?? "";
  return [title, filename, date, tags, notes].join(" ").toLowerCase();
}

export function filterLibraryRecordings(
  recordings: LibraryRecording[],
  options: {
    query: string;
    tag: string | null;
    hasComments: boolean;
    projectId?: string | null;
    folderId?: string | null;
  },
): LibraryRecording[] {
  const q = options.query.trim().toLowerCase();

  return recordings.filter((recording) => {
    if (options.folderId) {
      if (recording.folderId !== options.folderId) return false;
    } else if (options.projectId) {
      if (recording.projectId !== options.projectId) return false;
    }
    if (options.hasComments && recording.commentCount === 0) return false;
    if (options.tag && !recording.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase())) {
      return false;
    }
    if (!q) return true;
    return recordingSearchText(recording).includes(q);
  });
}

export function sortLibraryRecordings(
  recordings: LibraryRecording[],
  sort: LibrarySort,
): LibraryRecording[] {
  const copy = [...recordings];

  switch (sort) {
    case "oldest":
      return copy.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case "longest":
      return copy.sort((a, b) => {
        const aDur = a.durationSeconds ?? -1;
        const bDur = b.durationSeconds ?? -1;
        return bDur - aDur;
      });
    case "most-commented":
      return copy.sort((a, b) => {
        if (b.commentCount !== a.commentCount) {
          return b.commentCount - a.commentCount;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    case "newest":
    default:
      return copy.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
}

export function collectLibraryTags(recordings: LibraryRecording[]): string[] {
  const seen = new Map<string, string>();
  for (const recording of recordings) {
    for (const tag of recording.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
