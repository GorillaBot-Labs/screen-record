import { basename } from 'node:path'

/** Object key prefix inside the bucket (e.g. `recordings/recording_….mp4`). */
export const GCS_OBJECT_PREFIX = 'recordings'

export function gcsRecordingObjectName(localPath: string): string {
  return `${GCS_OBJECT_PREFIX}/${basename(localPath)}`
}
