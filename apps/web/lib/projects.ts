import { prisma } from "@/lib/prisma";

const MAX_NAME_LENGTH = 80;

export function normalizeProjectName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function normalizeFolderName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export type ProjectMutationResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

export async function createProjectInCatalog(name: string): Promise<ProjectMutationResult> {
  const normalized = normalizeProjectName(name);
  if (!normalized) return { ok: false, error: "Invalid project name" };

  try {
    const project = await prisma.project.create({
      data: { name: normalized },
      select: { id: true, name: true },
    });
    return { ok: true, id: project.id, name: project.name };
  } catch {
    return { ok: false, error: "Could not create project" };
  }
}

export type FolderMutationResult =
  | { ok: true; id: string; name: string; projectId: string; parentFolderId: string | null }
  | { ok: false; error: string };

export async function createFolderInCatalog(input: {
  projectId: string;
  name: string;
  parentFolderId?: string | null;
}): Promise<FolderMutationResult> {
  if (!input.projectId?.trim()) return { ok: false, error: "Missing project id" };
  const normalized = normalizeFolderName(input.name);
  if (!normalized) return { ok: false, error: "Invalid folder name" };

  try {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) return { ok: false, error: "Project not found" };

    if (input.parentFolderId) {
      const parent = await prisma.folder.findUnique({ where: { id: input.parentFolderId } });
      if (!parent || parent.projectId !== input.projectId) {
        return { ok: false, error: "Parent folder not found" };
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name: normalized,
        projectId: input.projectId,
        parentFolderId: input.parentFolderId ?? null,
      },
      select: { id: true, name: true, projectId: true, parentFolderId: true },
    });
    return {
      ok: true,
      id: folder.id,
      name: folder.name,
      projectId: folder.projectId,
      parentFolderId: folder.parentFolderId,
    };
  } catch {
    return { ok: false, error: "Could not create folder" };
  }
}

export type MoveRecordingResult =
  | { ok: true; projectId: string | null; folderId: string | null }
  | { ok: false; error: string };

export async function moveRecordingInCatalog(input: {
  recordingId: string;
  projectId: string | null;
  folderId: string | null;
}): Promise<MoveRecordingResult> {
  if (!input.recordingId?.trim()) return { ok: false, error: "Missing recording id" };

  let projectId = input.projectId;
  const folderId = input.folderId;

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) return { ok: false, error: "Folder not found" };
    if (projectId && folder.projectId !== projectId) {
      return { ok: false, error: "Folder does not belong to project" };
    }
    projectId = folder.projectId;
  } else if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return { ok: false, error: "Project not found" };
  }

  try {
    const recording = await prisma.recording.update({
      where: { id: input.recordingId },
      data: {
        projectId,
        folderId,
      },
      select: { projectId: true, folderId: true },
    });
    return {
      ok: true,
      projectId: recording.projectId,
      folderId: recording.folderId,
    };
  } catch {
    return { ok: false, error: "Could not move recording" };
  }
}

export type ProjectTree = {
  id: string;
  name: string;
  folders: Array<{
    id: string;
    name: string;
    parentFolderId: string | null;
  }>;
};

export type DeleteFolderResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

export async function deleteFolderInCatalog(folderId: string): Promise<DeleteFolderResult> {
  if (!folderId?.trim()) return { ok: false, error: "Missing folder id" };

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, projectId: true, parentFolderId: true },
  });
  if (!folder) return { ok: false, error: "Folder not found" };

  try {
    await prisma.$transaction([
      prisma.recording.updateMany({
        where: { folderId: folder.id },
        data: { folderId: null },
      }),
      prisma.folder.updateMany({
        where: { parentFolderId: folder.id },
        data: { parentFolderId: folder.parentFolderId },
      }),
      prisma.folder.delete({ where: { id: folder.id } }),
    ]);
    return { ok: true, projectId: folder.projectId };
  } catch {
    return { ok: false, error: "Could not delete folder" };
  }
}

export type DeleteProjectResult = { ok: true } | { ok: false; error: string };

export async function deleteProjectInCatalog(input: {
  projectId: string;
  confirmationName: string;
}): Promise<DeleteProjectResult> {
  if (!input.projectId?.trim()) return { ok: false, error: "Missing project id" };

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true },
  });
  if (!project) return { ok: false, error: "Project not found" };
  if (input.confirmationName !== project.name) {
    return { ok: false, error: "Project name does not match" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.recording.updateMany({
        where: { projectId: project.id },
        data: { projectId: null, folderId: null },
      });

      while (true) {
        const leafFolders = await tx.folder.findMany({
          where: { projectId: project.id, children: { none: {} } },
          select: { id: true },
        });
        if (leafFolders.length === 0) break;
        await tx.folder.deleteMany({
          where: { id: { in: leafFolders.map((item) => item.id) } },
        });
      }

      await tx.project.delete({ where: { id: project.id } });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete project" };
  }
}

export async function loadProjectTree(): Promise<ProjectTree[]> {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      folders: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentFolderId: true },
      },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    folders: project.folders,
  }));
}
