import { deleteRecordingsMp4Object } from "@/lib/gcs";
import { prisma } from "@/lib/prisma";

export type DeleteRecordingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteRecordingById(
  recordingId: string,
): Promise<DeleteRecordingResult> {
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
    await prisma.recordingComment.deleteMany({ where: { recordingId } });
    await prisma.recording.delete({ where: { id: recordingId } });
  } catch {
    return {
      ok: false,
      error: "Storage file was removed but the catalog row could not be deleted",
    };
  }

  return { ok: true };
}

export type BulkDeleteResult =
  | { ok: true; deleted: number; deletedIds: string[] }
  | { ok: false; error: string; deleted: number; deletedIds: string[] };

export async function deleteRecordingsByIds(ids: string[]): Promise<BulkDeleteResult> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "No recordings selected", deleted: 0, deletedIds: [] };
  }

  const deletedIds: string[] = [];
  for (const id of unique) {
    const result = await deleteRecordingById(id);
    if (!result.ok) {
      return {
        ok: false,
        error: deletedIds.length > 0 ? `${result.error} (${deletedIds.length} deleted before failure)` : result.error,
        deleted: deletedIds.length,
        deletedIds,
      };
    }
    deletedIds.push(id);
  }

  return { ok: true, deleted: deletedIds.length, deletedIds };
}
