export function buildRecordingShareUrl(recordingId: string, appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/+$/, "");
  return `${base}/r/${recordingId}`;
}

export function buildEmbedHtml(shareUrl: string): string {
  return `<iframe src="${shareUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
}
