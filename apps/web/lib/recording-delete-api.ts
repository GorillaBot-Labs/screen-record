import type { BulkDeleteResult, DeleteRecordingResult } from "@/lib/recording-delete";

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Delete request failed");
  }
}

export async function deleteRecordingViaApi(
  recordingId: string,
): Promise<DeleteRecordingResult> {
  const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE",
  });
  return parseJson(response);
}

export async function deleteRecordingsViaApi(ids: string[]): Promise<BulkDeleteResult> {
  const response = await fetch("/api/recordings/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return parseJson(response);
}
