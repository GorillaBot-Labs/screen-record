/** Parse the major macOS version from Electron's `process.getSystemVersion()` string. */
export function parseMacOsMajor(systemVersion: string): number | null {
  const rawMajor = systemVersion.split('.')[0]?.trim()
  if (!rawMajor) return null
  const major = Number.parseInt(rawMajor, 10)
  return Number.isFinite(major) ? major : null
}

export function ensureSupportedMacOs(
  platform: NodeJS.Platform = process.platform,
  systemVersion: string = typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : '',
): { ok: true } | { ok: false; error: string } {
  if (platform !== 'darwin') {
    return { ok: false, error: 'Screen recording is only supported on macOS.' }
  }
  const major = parseMacOsMajor(systemVersion)
  if (major != null && major < 13) {
    return {
      ok: false,
      error: `Unsupported macOS version (${systemVersion || 'unknown'}). Screen Record requires macOS 13+ (ScreenCaptureKit).`,
    }
  }
  return { ok: true }
}
