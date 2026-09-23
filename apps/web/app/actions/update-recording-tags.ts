"use server";

import { revalidatePath } from "next/cache";
import { updateRecordingTagsInCatalog } from "@/lib/recording-catalog";

export async function updateRecordingTags(recordingId: string, tags: string[]) {
  const result = await updateRecordingTagsInCatalog(recordingId, tags);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/r/${recordingId}`);
  }
  return result;
}
