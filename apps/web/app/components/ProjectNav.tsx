"use client";

import { createProject } from "@/app/actions/projects";
import { PromptModal } from "@/app/components/PromptModal";
import type { ProjectTree } from "@/lib/projects";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type CreatePrompt = { kind: "project" };

type ProjectNavProps = {
  projectTree: ProjectTree[];
  onNavigate?: () => void;
};

function folderHref(projectId: string, folderId?: string) {
  const params = new URLSearchParams({ project: projectId });
  if (folderId) params.set("folder", folderId);
  return `/?${params.toString()}`;
}

export function ProjectNav({ projectTree, onNavigate }: ProjectNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProject = searchParams.get("project");
  const activeFolder = searchParams.get("folder");
  const onLibraryHome = pathname === "/" && !activeProject;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createPrompt, setCreatePrompt] = useState<CreatePrompt | null>(null);

  const rootsByProject = useMemo(() => {
    const map = new Map<string, ProjectTree["folders"]>();
    for (const project of projectTree) {
      map.set(
        project.id,
        project.folders.filter((folder) => !folder.parentFolderId),
      );
    }
    return map;
  }, [projectTree]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string, ProjectTree["folders"]>();
    for (const project of projectTree) {
      for (const folder of project.folders) {
        if (!folder.parentFolderId) continue;
        const siblings = map.get(folder.parentFolderId) ?? [];
        siblings.push(folder);
        map.set(folder.parentFolderId, siblings);
      }
    }
    return map;
  }, [projectTree]);

  const handleCreateConfirm = useCallback(
    async (name: string) => {
      const prompt = createPrompt;
      setCreatePrompt(null);
      if (!prompt) return;

      const result = await createProject(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created project “${result.name}”`);
      onNavigate?.();
    },
    [createPrompt, onNavigate],
  );

  const renderFolder = (projectId: string, folder: ProjectTree["folders"][number], depth = 0) => {
    const childFolders = childrenByFolder.get(folder.id) ?? [];
    const isActive = activeProject === projectId && activeFolder === folder.id;
    const paddingLeft = 12 + depth * 12;

    return (
      <div key={folder.id}>
        <div className="flex items-center gap-0.5" style={{ paddingLeft }}>
          {childFolders.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [`folder:${folder.id}`]: !prev[`folder:${folder.id}`],
                }))
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-surface hover:text-foreground"
              aria-label={expanded[`folder:${folder.id}`] ? "Collapse folder" : "Expand folder"}
            >
              {expanded[`folder:${folder.id}`] ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          ) : (
            <span className="inline-block h-7 w-7 shrink-0" aria-hidden />
          )}
          <Link
            href={folderHref(projectId, folder.id)}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-w-0 flex-1 rounded-lg px-2 py-2 text-sm transition-colors ${
              isActive
                ? "bg-accent-soft text-accent"
                : "text-zinc-600 hover:bg-surface hover:text-foreground"
            }`}
          >
            <span className="truncate">{folder.name}</span>
          </Link>
        </div>
        {expanded[`folder:${folder.id}`]
          ? childFolders.map((child) => renderFolder(projectId, child, depth + 1))
          : null}
      </div>
    );
  };

  const promptConfig = createPrompt
    ? { title: "New project", label: "Project name" }
    : null;

  return (
    <>
      <PromptModal
        open={createPrompt !== null}
        title={promptConfig?.title ?? ""}
        label={promptConfig?.label ?? ""}
        onConfirm={(name) => void handleCreateConfirm(name)}
        onCancel={() => setCreatePrompt(null)}
      />
      <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Projects</span>
        <button
          type="button"
          onClick={() => setCreatePrompt({ kind: "project" })}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Create project"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-1 px-1">
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={onLibraryHome ? "page" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            onLibraryHome
              ? "bg-accent-soft text-accent"
              : "text-zinc-600 hover:bg-surface hover:text-foreground"
          }`}
        >
          All recordings
        </Link>

        {projectTree.map((project) => {
          const isProjectActive = activeProject === project.id && !activeFolder;
          const roots = rootsByProject.get(project.id) ?? [];

          return (
            <div key={project.id} className="rounded-lg">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [project.id]: !prev[project.id] }))
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-surface hover:text-foreground"
                  aria-label={expanded[project.id] ? "Collapse project" : "Expand project"}
                >
                  {expanded[project.id] ? (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </button>
                <Link
                  href={folderHref(project.id)}
                  onClick={onNavigate}
                  aria-current={isProjectActive ? "page" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                    isProjectActive
                      ? "bg-accent-soft text-accent"
                      : "text-zinc-600 hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{project.name}</span>
                </Link>
              </div>
              {expanded[project.id]
                ? roots.map((folder) => renderFolder(project.id, folder))
                : null}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
