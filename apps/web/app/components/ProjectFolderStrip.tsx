"use client";

import { Folder, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef } from "react";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";

export type ProjectFolderItem = {
  id: string;
  name: string;
  recordingCount: number;
};

type ProjectFolderStripProps = {
  projectId: string;
  folders: ProjectFolderItem[];
  activeFolderId?: string | null;
  showProjectRootDrop?: boolean;
};

function folderHref(projectId: string, folderId: string) {
  return `/?project=${projectId}&folder=${folderId}`;
}

type FolderBlockProps = {
  id: string;
  folderId: string | null;
  isActive?: boolean;
  href?: string;
  icon: React.ReactNode;
  name: string;
  detail: string;
};

function FolderBlock({
  id,
  folderId,
  isActive = false,
  href,
  icon,
  name,
  detail,
}: FolderBlockProps) {
  const suppressClickRef = useRef(false);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "folder", folderId },
  });

  useDndMonitor({
    onDragEnd(event) {
      if (event.over?.id === id) suppressClickRef.current = true;
    },
  });

  const blockNavigationAfterDrop = useCallback((event: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }, []);

  const className = `flex w-40 shrink-0 flex-col rounded-xl px-3 py-3 transition-colors ${
    isOver
      ? "bg-accent text-white ring-2 ring-accent-soft"
      : isActive
        ? "bg-accent-soft ring-1 ring-accent-muted"
        : "bg-surface ring-1 ring-border hover:bg-background"
  }`;

  const content = (
    <>
      <span
        className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${
          isOver
            ? "bg-white/15 text-white"
            : isActive
              ? "bg-background text-accent ring-1 ring-accent-muted"
              : "bg-background text-accent ring-1 ring-border"
        }`}
      >
        {icon}
      </span>
      <span
        className={`truncate text-sm font-medium leading-tight ${
          isOver ? "text-white" : "text-foreground"
        }`}
      >
        {name}
      </span>
      <span
        className={`mt-0.5 truncate text-xs ${
          isOver ? "text-white/80" : isActive ? "text-accent/80" : "text-muted"
        }`}
      >
        {detail}
      </span>
    </>
  );

  if (href) {
    return (
      <div ref={setNodeRef} className="shrink-0">
        <Link
          href={href}
          onClick={blockNavigationAfterDrop}
          aria-current={isActive ? "page" : undefined}
          className={className}
        >
          {content}
        </Link>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={className}>
      {content}
    </div>
  );
}

export function ProjectFolderStrip({
  projectId,
  folders,
  activeFolderId = null,
  showProjectRootDrop = false,
}: ProjectFolderStripProps) {
  if (folders.length === 0 && !showProjectRootDrop) return null;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {showProjectRootDrop ? (
        <FolderBlock
          id="folder-root"
          folderId={null}
          icon={<FolderOpen className="h-4 w-4" aria-hidden />}
          name="Project root"
          detail="Drop here"
        />
      ) : null}
      {folders.map((folder) => {
        const isActive = activeFolderId === folder.id;
        const detail =
          folder.recordingCount === 1
            ? "1 video"
            : `${folder.recordingCount} videos`;

        return (
          <FolderBlock
            key={folder.id}
            id={`folder-${folder.id}`}
            folderId={folder.id}
            isActive={isActive}
            href={folderHref(projectId, folder.id)}
            icon={<Folder className="h-4 w-4" aria-hidden />}
            name={folder.name}
            detail={detail}
          />
        );
      })}
    </div>
  );
}
