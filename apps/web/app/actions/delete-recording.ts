"use server";

import { revalidatePath } from "next/cache";
import {
  deleteRecordingById,
  type DeleteRecordingResult,
} from "@/lib/recording-delete";

export type { DeleteRecordingResult };

export async function deleteRecording(recordingId: string): Promise<DeleteRecordingResult> {
  const result = await deleteRecordingById(recordingId);
  if (result.ok) revalidatePath("/");
  return result;
}
