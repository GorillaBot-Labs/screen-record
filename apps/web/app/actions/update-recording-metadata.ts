"use server";

import { revalidatePath } from "next/cache";
import {
  updateRecordingMetadataInCatalog,
  type UpdateRecordingMetadataResult,
} from "@/lib/recording-catalog";

export type { UpdateRecordingMetadataResult };

export async function updateRecordingMetadata(
  recordingId: string,
  fields: { title?: string; notes?: string },
): Promise<UpdateRecordingMetadataResult> {
  const result = await updateRecordingMetadataInCatalog(recordingId, fields);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/r/${recordingId}`);
  }
  return result;
}
