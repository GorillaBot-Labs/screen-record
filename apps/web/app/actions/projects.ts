"use server";

import { revalidatePath } from "next/cache";
import {
  createFolderInCatalog,
  createProjectInCatalog,
  deleteFolderInCatalog,
  deleteProjectInCatalog,
  moveRecordingInCatalog,
} from "@/lib/projects";

export async function createProject(name: string) {
  const result = await createProjectInCatalog(name);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function createFolder(input: {
  projectId: string;
  name: string;
  parentFolderId?: string | null;
}) {
  const result = await createFolderInCatalog(input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function moveRecording(input: {
  recordingId: string;
  projectId: string | null;
  folderId: string | null;
}) {
  const result = await moveRecordingInCatalog(input);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/r/${input.recordingId}`);
  }
  return result;
}

export async function deleteFolder(folderId: string) {
  const result = await deleteFolderInCatalog(folderId);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function deleteProject(input: { projectId: string; confirmationName: string }) {
  const result = await deleteProjectInCatalog(input);
  if (result.ok) revalidatePath("/");
  return result;
}
