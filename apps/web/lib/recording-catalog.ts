import {
  normalizeRecordingNotes,
  normalizeRecordingTitle,
} from "@/lib/recording-metadata";
import { normalizeTags } from "@/lib/recording-tags";
import { prisma } from "@/lib/prisma";

export type UpdateRecordingTagsResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export async function updateRecordingTagsInCatalog(
  recordingId: string,
  tags: string[],
): Promise<UpdateRecordingTagsResult> {
  if (!recordingId?.trim()) {
    return { ok: false, error: "Missing recording id" };
  }

  const normalized = normalizeTags(tags);

  try {
    const recording = await prisma.recording.update({
      where: { id: recordingId },
      data: { tags: normalized },
      select: { tags: true },
    });
    return { ok: true, tags: recording.tags };
  } catch {
    return { ok: false, error: "Could not update tags" };
  }
}

export type UpdateRecordingMetadataResult =
  | { ok: true; title: string | null; notes: string | null }
  | { ok: false; error: string };

export async function updateRecordingMetadataInCatalog(
  recordingId: string,
  fields: { title?: string; notes?: string },
): Promise<UpdateRecordingMetadataResult> {
  if (!recordingId?.trim()) {
    return { ok: false, error: "Missing recording id" };
  }

  const data: { title?: string | null; notes?: string | null } = {};

  if (fields.title !== undefined) {
    const title = normalizeRecordingTitle(fields.title);
    if (!title) return { ok: false, error: "Invalid title" };
    data.title = title;
  }

  if (fields.notes !== undefined) {
    const notes = normalizeRecordingNotes(fields.notes);
    if (notes === null) return { ok: false, error: "Invalid description" };
    data.notes = notes || null;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }

  try {
    const recording = await prisma.recording.update({
      where: { id: recordingId },
      data,
      select: { title: true, notes: true },
    });
    return { ok: true, title: recording.title, notes: recording.notes };
  } catch {
    return { ok: false, error: "Could not update recording" };
  }
}
