"use server";

import { denyUnlessGalleryOperator } from "@/lib/gallery-auth";
import { revalidatePath } from "next/cache";
import { updateRecordingMetadataInCatalog } from "@/lib/recording-catalog";

export async function updateRecordingMetadata(
  recordingId: string,
  fields: { title?: string; notes?: string },
) {
  return denyUnlessGalleryOperator(async () => {
    const result = await updateRecordingMetadataInCatalog(recordingId, fields);
    if (result.ok) {
      revalidatePath("/");
      revalidatePath(`/r/${recordingId}`);
      revalidatePath(`/recordings/${recordingId}`);
    }
    return result;
  });
}
