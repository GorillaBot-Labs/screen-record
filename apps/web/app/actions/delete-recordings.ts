"use server";

import { revalidatePath } from "next/cache";
import { deleteRecordingsByIds } from "@/lib/recording-delete";

export async function deleteRecordings(ids: string[]) {
  const result = await deleteRecordingsByIds(ids);
  if (result.ok || result.deleted > 0) revalidatePath("/");
  return result;
}
