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
