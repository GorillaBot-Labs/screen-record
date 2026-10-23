/** JPEG poster stored beside the MP4 (`recordings/foo.mp4` → `recordings/foo.poster.jpg`). */
export function posterObjectNameForRecording(gcsObjectName: string): string {
  const name = gcsObjectName.trim();
  if (!name.startsWith("recordings/") || !name.toLowerCase().endsWith(".mp4")) {
    throw new Error("Invalid recording object name");
  }
  return name.replace(/\.mp4$/i, ".poster.jpg");
}
