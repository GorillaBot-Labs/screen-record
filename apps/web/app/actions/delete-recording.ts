"use server";

import { revalidatePath } from "next/cache";
import { deleteRecordingById } from "@/lib/recording-delete";

export async function deleteRecording(recordingId: string) {
  const result = await deleteRecordingById(recordingId);
  if (result.ok) revalidatePath("/");
  return result;
}
