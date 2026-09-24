/** Default `displayIndex:audioIndex` when the renderer omits `captureInput`. */
export const DEFAULT_CAPTURE_INPUT = '0:0'

export type CaptureIndices = { video: number; audio: number; camera: number }

/** Parse `display:audio` or `display:audio:camera` from the renderer. */
export function parseCaptureIndices(input: string): CaptureIndices {
  const parts = input.split(':')
  const video = Number.parseInt(parts[0] ?? '', 10)
  const audio = Number.parseInt(parts[1] ?? '', 10)
  const cameraRaw = parts[2]
  let camera = 0
  if (cameraRaw !== undefined && cameraRaw !== '') {
    const parsed = Number.parseInt(cameraRaw, 10)
    if (!Number.isNaN(parsed)) camera = parsed
  }
  if (Number.isNaN(video) || Number.isNaN(audio)) {
    const [dv, da] = DEFAULT_CAPTURE_INPUT.split(':')
    return { video: Number.parseInt(dv!, 10), audio: Number.parseInt(da!, 10), camera: 0 }
  }
  return { video, audio, camera }
}
