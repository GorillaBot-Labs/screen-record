"use server";

import { revalidatePath } from "next/cache";
import {
  createFolderInCatalog,
  createProjectInCatalog,
  moveRecordingInCatalog,
  type FolderMutationResult,
  type MoveRecordingResult,
  type ProjectMutationResult,
} from "@/lib/projects";

export async function createProject(name: string): Promise<ProjectMutationResult> {
  const result = await createProjectInCatalog(name);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function createFolder(input: {
  projectId: string;
  name: string;
  parentFolderId?: string | null;
}): Promise<FolderMutationResult> {
  const result = await createFolderInCatalog(input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function moveRecording(input: {
  recordingId: string;
  projectId: string | null;
  folderId: string | null;
}): Promise<MoveRecordingResult> {
  const result = await moveRecordingInCatalog(input);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/r/${input.recordingId}`);
  }
  return result;
}
