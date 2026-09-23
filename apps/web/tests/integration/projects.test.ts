import { describe, expect, it } from "vitest";
import {
  createFolderInCatalog,
  createProjectInCatalog,
  deleteFolderInCatalog,
  deleteProjectInCatalog,
  moveRecordingInCatalog,
} from "@/lib/projects";
import { prisma } from "@/lib/prisma";
import { createTestRecording } from "./helpers/recording-fixture";

describe("projects and folders", () => {
  it("creates a project, nested folder, and assigns a recording", async () => {
    const project = await createProjectInCatalog("Client work");
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    const folder = await createFolderInCatalog({
      projectId: project.id,
      name: "Sprint demos",
    });
    expect(folder.ok).toBe(true);
    if (!folder.ok) return;

    const subfolder = await createFolderInCatalog({
      projectId: project.id,
      name: "Week 12",
      parentFolderId: folder.id,
    });
    expect(subfolder.ok).toBe(true);
    if (!subfolder.ok) return;

    const recording = await createTestRecording();
    const moved = await moveRecordingInCatalog({
      recordingId: recording.id,
      projectId: project.id,
      folderId: subfolder.id,
    });

    expect(moved).toEqual({
      ok: true,
      projectId: project.id,
      folderId: subfolder.id,
    });

    const updated = await prisma.recording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(updated.projectId).toBe(project.id);
    expect(updated.folderId).toBe(subfolder.id);
  });

  it("deletes a folder and moves recordings to the project root", async () => {
    const project = await createProjectInCatalog("Delete folder project");
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    const folder = await createFolderInCatalog({
      projectId: project.id,
      name: "To delete",
    });
    expect(folder.ok).toBe(true);
    if (!folder.ok) return;

    const subfolder = await createFolderInCatalog({
      projectId: project.id,
      name: "Child folder",
      parentFolderId: folder.id,
    });
    expect(subfolder.ok).toBe(true);
    if (!subfolder.ok) return;

    const recording = await createTestRecording();
    await moveRecordingInCatalog({
      recordingId: recording.id,
      projectId: project.id,
      folderId: folder.id,
    });

    const deleted = await deleteFolderInCatalog(folder.id);
    expect(deleted).toEqual({ ok: true, projectId: project.id });

    const updatedRecording = await prisma.recording.findUniqueOrThrow({
      where: { id: recording.id },
    });
    expect(updatedRecording.projectId).toBe(project.id);
    expect(updatedRecording.folderId).toBeNull();

    const reparentedSubfolder = await prisma.folder.findUniqueOrThrow({
      where: { id: subfolder.id },
    });
    expect(reparentedSubfolder.parentFolderId).toBeNull();

    await expect(prisma.folder.findUnique({ where: { id: folder.id } })).resolves.toBeNull();
  });

  it("deletes a project after name confirmation and moves recordings to the library", async () => {
    const project = await createProjectInCatalog("Delete me");
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    const folder = await createFolderInCatalog({
      projectId: project.id,
      name: "Nested",
    });
    expect(folder.ok).toBe(true);
    if (!folder.ok) return;

    const recording = await createTestRecording();
    await moveRecordingInCatalog({
      recordingId: recording.id,
      projectId: project.id,
      folderId: folder.id,
    });

    const wrongName = await deleteProjectInCatalog({
      projectId: project.id,
      confirmationName: "delete me",
    });
    expect(wrongName).toEqual({ ok: false, error: "Project name does not match" });

    const deleted = await deleteProjectInCatalog({
      projectId: project.id,
      confirmationName: "Delete me",
    });
    expect(deleted).toEqual({ ok: true });

    const updatedRecording = await prisma.recording.findUniqueOrThrow({
      where: { id: recording.id },
    });
    expect(updatedRecording.projectId).toBeNull();
    expect(updatedRecording.folderId).toBeNull();

    await expect(prisma.project.findUnique({ where: { id: project.id } })).resolves.toBeNull();
    await expect(prisma.folder.findMany({ where: { projectId: project.id } })).resolves.toEqual([]);
  });
});
