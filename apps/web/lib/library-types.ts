export type LibraryRecording = {
  id: string;
  title: string | null;
  gcsObjectName: string;
  publicUrl: string;
  createdAt: string;
  notes: string | null;
  tags: string[];
  durationSeconds: number | null;
  commentCount: number;
  projectId: string | null;
  folderId: string | null;
};

export type LibrarySort =
  | "newest"
  | "oldest"
  | "longest"
  | "most-commented";

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  longest: "Longest first",
  "most-commented": "Most comments",
};
