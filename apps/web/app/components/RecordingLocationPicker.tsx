"use client";

import { moveRecording } from "@/app/actions/projects";
import type { ProjectTree } from "@/lib/projects";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type RecordingLocationPickerProps = {
  recordingId: string;
  projectTree: ProjectTree[];
  projectId: string | null;
  folderId: string | null;
  compact?: boolean;
};

export function RecordingLocationPicker({
  recordingId,
  projectTree,
  projectId,
  folderId,
  compact = false,
}: RecordingLocationPickerProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (nextProjectId: string, nextFolderId: string) => {
      setSaving(true);
      try {
        const result = await moveRecording({
          recordingId,
          projectId: nextProjectId || null,
          folderId: nextFolderId || null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Recording moved");
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [recordingId, router],
  );

  if (projectTree.length === 0) return null;

  const foldersForProject = projectTree.find((p) => p.id === projectId)?.folders ?? [];

  const selectClass = compact
    ? "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
    : "rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${compact ? "text-xs" : "mt-4 text-sm"}`}
    >
      <span className={compact ? "sr-only" : "text-muted"}>Location</span>
      <select
        value={projectId ?? ""}
        disabled={saving}
        onChange={(e) => void handleChange(e.target.value, "")}
        className={selectClass}
        aria-label="Project"
      >
        <option value="">Unfiled</option>
        {projectTree.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {projectId ? (
        <select
          value={folderId ?? ""}
          disabled={saving}
          onChange={(e) => void handleChange(projectId, e.target.value)}
          className={selectClass}
          aria-label="Folder"
        >
          <option value="">Project root</option>
          {foldersForProject.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.parentFolderId ? `↳ ${folder.name}` : folder.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
