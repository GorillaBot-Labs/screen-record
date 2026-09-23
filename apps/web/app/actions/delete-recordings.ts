"use server";

import { revalidatePath } from "next/cache";
import { deleteRecordingsByIds } from "@/lib/recording-delete";
import type { BulkDeleteResult } from "@/lib/recording-delete";

export type { BulkDeleteResult };

export async function deleteRecordings(ids: string[]): Promise<BulkDeleteResult> {
  const result = await deleteRecordingsByIds(ids);
  if (result.ok || result.deleted > 0) revalidatePath("/");
  return result;
}
