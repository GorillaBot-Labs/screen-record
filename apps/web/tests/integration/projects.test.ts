import { describe, expect, it } from "vitest";
import {
  createFolderInCatalog,
  createProjectInCatalog,
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
});
