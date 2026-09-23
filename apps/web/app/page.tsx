import { LibraryView } from "@/app/components/LibraryView";
import { ProjectPageHeader } from "@/app/components/ProjectPageHeader";
import type { LibraryRecording } from "@/lib/library-types";
import { loadProjectTree } from "@/lib/projects";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadRecordings(filters: { projectId?: string; folderId?: string }) {
  try {
    const recordings = await prisma.recording.findMany({
      where: {
        ...(filters.folderId
          ? { folderId: filters.folderId }
          : filters.projectId
            ? { projectId: filters.projectId, folderId: null }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { comments: true } },
      },
    });
    return { ok: true as const, recordings };
  } catch (err) {
    console.error(err);
    return { ok: false as const };
  }
}

function toLibraryRecording(recording: {
  id: string;
  title: string | null;
  gcsObjectName: string;
  publicUrl: string;
  createdAt: Date;
  notes: string | null;
  tags: string[];
  durationSeconds: number | null;
  projectId: string | null;
  folderId: string | null;
  _count: { comments: number };
}): LibraryRecording {
  return {
    id: recording.id,
    title: recording.title,
    gcsObjectName: recording.gcsObjectName,
    publicUrl: recording.publicUrl,
    createdAt: recording.createdAt.toISOString(),
    notes: recording.notes,
    tags: recording.tags ?? [],
    durationSeconds: recording.durationSeconds,
    commentCount: recording._count.comments,
    projectId: recording.projectId,
    folderId: recording.folderId,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; folder?: string }>;
}) {
  const { project, folder } = await searchParams;
  const [result, projectTree] = await Promise.all([
    loadRecordings({ projectId: project, folderId: folder }),
    loadProjectTree(),
  ]);

  const activeProject = projectTree.find((item) => item.id === project);
  const activeFolder = activeProject?.folders.find((item) => item.id === folder);

  let visibleFolders: Array<{ id: string; name: string; recordingCount: number }> = [];
  if (activeProject) {
    const counts = await prisma.recording.groupBy({
      by: ["folderId"],
      where: { projectId: activeProject.id, folderId: { not: null } },
      _count: { _all: true },
    });
    const countByFolder = new Map(
      counts
        .filter((item) => item.folderId)
        .map((item) => [item.folderId as string, item._count._all]),
    );
    visibleFolders = activeProject.folders
      .filter((item) => (folder ? item.parentFolderId === folder : !item.parentFolderId))
      .map((item) => ({
        id: item.id,
        name: item.name,
        recordingCount: countByFolder.get(item.id) ?? 0,
      }));
  }

  const heading = activeFolder?.name ?? activeProject?.name ?? "Videos";
  const subtitle = activeProject
    ? null
    : "Search, tag, sort, and manage your screen recordings.";

  return (
    <main className="flex min-h-full flex-1 flex-col bg-background px-4 py-4 md:px-6 md:py-5">
      {activeProject ? (
        <ProjectPageHeader
          projectId={activeProject.id}
          projectName={activeProject.name}
          folderId={folder ?? null}
          folderName={activeFolder?.name ?? null}
        />
      ) : (
        <header className="mb-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {heading}
          </h1>
          {subtitle ? <p className="mt-0.5 max-w-xl text-sm text-muted">{subtitle}</p> : null}
        </header>
      )}

      <div className="flex-1">
        {!result.ok ? (
          <div
            className="rounded-xl border border-red-200 bg-danger-soft px-5 py-6 text-sm text-red-900"
            role="alert"
          >
            <p className="font-medium">Could not load recordings</p>
            <p className="mt-1 text-red-800/90">
              Something went wrong on our end. Refresh the page, or try again in a moment.
            </p>
          </div>
        ) : (
          <LibraryView
            recordings={result.recordings.map(toLibraryRecording)}
            projectId={project ?? null}
            folderId={folder ?? null}
            folders={visibleFolders}
          />
        )}
      </div>
    </main>
  );
}
