"use client";

import { createFolder, deleteFolder, deleteProject } from "@/app/actions/projects";
import { PromptModal } from "@/app/components/PromptModal";
import { Ellipsis, FolderPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type ProjectPageActionsProps = {
  projectId: string;
  projectName: string;
  activeFolderId?: string | null;
  activeFolderName?: string | null;
};

export function ProjectPageActions({
  projectId,
  projectName,
  activeFolderId = null,
  activeFolderName = null,
}: ProjectPageActionsProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isFolderView = Boolean(activeFolderId);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleCreateConfirm = useCallback(
    async (name: string) => {
      setCreateOpen(false);
      const result = await createFolder({
        projectId,
        name,
        parentFolderId: activeFolderId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created folder “${result.name}”`);
      router.refresh();
    },
    [activeFolderId, projectId, router],
  );

  const handleDeleteFolder = useCallback(async () => {
    setMenuOpen(false);
    if (!activeFolderId || !activeFolderName) return;
    if (
      !window.confirm(
        `Delete folder “${activeFolderName}”? Recordings in this folder will move to the project root.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    const result = await deleteFolder(activeFolderId);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted folder “${activeFolderName}”`);
    router.push(`/?project=${projectId}`);
    router.refresh();
  }, [activeFolderId, activeFolderName, projectId, router]);

  const handleDeleteProjectConfirm = useCallback(
    async (confirmationName: string) => {
      setDeleteProjectOpen(false);
      setDeleting(true);
      const result = await deleteProject({ projectId, confirmationName });
      setDeleting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted project “${projectName}”`);
      router.push("/");
      router.refresh();
    },
    [projectId, projectName, router],
  );

  return (
    <>
      <PromptModal
        open={createOpen}
        title={isFolderView ? "New subfolder" : "New folder"}
        label={isFolderView ? "Subfolder name" : "Folder name"}
        onConfirm={(name) => void handleCreateConfirm(name)}
        onCancel={() => setCreateOpen(false)}
      />
      <PromptModal
        open={deleteProjectOpen}
        title="Delete project"
        description={`Recordings in “${projectName}” will move to your library as unfiled. This cannot be undone.`}
        label={`Type “${projectName}” to confirm`}
        placeholder={projectName}
        expectedValue={projectName}
        confirmLabel="Delete project"
        destructive
        onConfirm={(name) => void handleDeleteProjectConfirm(name)}
        onCancel={() => setDeleteProjectOpen(false)}
      />
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={deleting}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 sm:px-3 sm:text-sm"
        >
          <FolderPlus className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{isFolderView ? "Subfolder" : "Folder"}</span>
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={deleting}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
            aria-label="Project options"
          >
            <Ellipsis className="h-4 w-4" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-sticky mt-1 min-w-40 rounded-lg border border-border bg-background py-1 shadow-[0_4px_16px_rgb(0,0,0,0.08)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  if (isFolderView) void handleDeleteFolder();
                  else setDeleteProjectOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 transition-colors hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {isFolderView ? "Delete folder" : "Delete project"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
