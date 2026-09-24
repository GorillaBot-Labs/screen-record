/** Only GCS HTTPS URLs may be opened from the desktop shell handler. */
export function isSafeHttpsRecordingUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.hostname === 'storage.googleapis.com') return true
    if (u.hostname.endsWith('.storage.googleapis.com')) return true
    return false
  } catch {
    return false
  }
}
