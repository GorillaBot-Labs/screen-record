import { basename } from 'node:path'

/** Object key prefix inside the bucket (e.g. `recordings/recording_….mp4`). */
export const GCS_OBJECT_PREFIX = 'recordings'

export function gcsRecordingObjectName(localPath: string): string {
  return `${GCS_OBJECT_PREFIX}/${basename(localPath)}`
}

/** JPEG poster stored beside the MP4 (`recordings/foo.mp4` → `recordings/foo.poster.jpg`). */
export function gcsPosterObjectName(mp4ObjectName: string): string {
  const name = mp4ObjectName.trim()
  if (!name.toLowerCase().endsWith('.mp4')) {
    throw new Error('Poster object name requires an .mp4 recording key')
  }
  return name.replace(/\.mp4$/i, '.poster.jpg')
}
