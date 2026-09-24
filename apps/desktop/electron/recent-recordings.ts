import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function storeFilePath(): string {
  return path.join(homedir(), ".screen-record", "recent-recordings.json");
}

/** Remove legacy recent-upload history (including old GCS URLs). */
export function purgeLegacyRecentRecordingStore(): void {
  const file = storeFilePath();
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
}
