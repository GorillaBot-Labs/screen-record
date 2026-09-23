"use client";

import { ProjectPageActions } from "@/app/components/ProjectPageActions";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

type ProjectPageHeaderProps = {
  projectId: string;
  projectName: string;
  folderId?: string | null;
  folderName?: string | null;
};

export function ProjectPageHeader({
  projectId,
  projectName,
  folderId = null,
  folderName = null,
}: ProjectPageHeaderProps) {
  const inFolder = Boolean(folderId && folderName);

  return (
    <header className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {inFolder ? (
          <nav
            aria-label="Location"
            className="mb-1 flex items-center gap-1 text-xs text-muted"
          >
            <Link
              href={`/?project=${projectId}`}
              className="truncate transition-colors hover:text-foreground"
            >
              {projectName}
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            <span className="truncate text-foreground">{folderName}</span>
          </nav>
        ) : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          {inFolder ? folderName : projectName}
        </h1>
      </div>
      <ProjectPageActions
        projectId={projectId}
        projectName={projectName}
        activeFolderId={folderId}
        activeFolderName={folderName}
      />
    </header>
  );
}
