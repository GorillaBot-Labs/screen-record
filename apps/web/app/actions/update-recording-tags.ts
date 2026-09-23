"use server";

import { revalidatePath } from "next/cache";
import {
  updateRecordingTagsInCatalog,
  type UpdateRecordingTagsResult,
} from "@/lib/recording-catalog";

export type { UpdateRecordingTagsResult };

export async function updateRecordingTags(
  recordingId: string,
  tags: string[],
): Promise<UpdateRecordingTagsResult> {
  const result = await updateRecordingTagsInCatalog(recordingId, tags);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/r/${recordingId}`);
  }
  return result;
}
