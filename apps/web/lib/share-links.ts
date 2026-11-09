export function buildRecordingShareUrl(recordingId: string, appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/+$/, "");
  return `${base}/r/${recordingId}`;
}

export function buildTimestampedShareUrl(shareUrl: string, playheadSeconds: number): string {
  const seconds = Math.max(0, Math.floor(playheadSeconds));
  return `${shareUrl}?t=${seconds}`;
}

export function buildEmbedHtml(shareUrl: string): string {
  return `<iframe src="${shareUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
}
