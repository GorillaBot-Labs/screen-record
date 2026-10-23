/** Basename of the object in GCS, used as the saved filename. */
export function recordingDownloadFilename(
  gcsObjectName: string,
  recordingId: string,
): string {
  const base = gcsObjectName.split("/").pop()?.trim();
  if (base) return base;
  return `recording-${recordingId}.mp4`;
}

export function recordingDownloadPath(recordingId: string): string {
  return `/api/recordings/${recordingId}/download`;
}

/** `Content-Disposition` for a file download (ASCII fallback + UTF-8 filename). */
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  const safeAscii = ascii.length > 0 ? ascii : "recording.mp4";
  const encoded = encodeURIComponent(filename).replace(
    /[!'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}
