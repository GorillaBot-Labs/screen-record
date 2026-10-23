"use server";

import { denyUnlessGalleryOperator } from "@/lib/gallery-auth";
import { revalidatePath } from "next/cache";
import { updateRecordingTagsInCatalog } from "@/lib/recording-catalog";

export async function updateRecordingTags(recordingId: string, tags: string[]) {
  return denyUnlessGalleryOperator(async () => {
    const result = await updateRecordingTagsInCatalog(recordingId, tags);
    if (result.ok) {
      revalidatePath("/");
      revalidatePath(`/r/${recordingId}`);
      revalidatePath(`/recordings/${recordingId}`);
    }
    return result;
  });
}
