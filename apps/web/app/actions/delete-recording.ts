"use server";

import { revalidatePath } from "next/cache";
import { deleteRecordingsMp4Object } from "@/lib/gcs";
import { prisma } from "@/lib/prisma";

export type DeleteRecordingResult = { ok: true } | { ok: false; error: string };

export async function deleteRecording(recordingId: string): Promise<DeleteRecordingResult> {
  if (!recordingId?.trim()) {
    return { ok: false, error: "Missing recording id" };
  }

  let recording;
  try {
    recording = await prisma.recording.findUnique({ where: { id: recordingId } });
  } catch {
    return { ok: false, error: "Could not look up recording" };
  }

  if (!recording) {
    return { ok: false, error: "Recording not found" };
  }

  try {
    await deleteRecordingsMp4Object(recording.gcsObjectName);
  } catch {
    return { ok: false, error: "Could not delete file from storage" };
  }

  try {
    await prisma.recording.delete({ where: { id: recordingId } });
  } catch {
    return { ok: false, error: "Storage file was removed but the catalog row could not be deleted" };
  }

  revalidatePath("/");
  return { ok: true };
}
