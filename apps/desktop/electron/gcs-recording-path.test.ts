import { describe, expect, it } from 'vitest'
import { GCS_OBJECT_PREFIX, gcsRecordingObjectName } from './gcs-recording-path'

describe('gcsRecordingObjectName', () => {
  it('prefixes the basename with the recordings folder', () => {
    expect(gcsRecordingObjectName('/tmp/screen-record/recording_2024.mp4')).toBe(
      `${GCS_OBJECT_PREFIX}/recording_2024.mp4`,
    )
    expect(gcsRecordingObjectName('recording_2024.mp4')).toBe(`${GCS_OBJECT_PREFIX}/recording_2024.mp4`)
  })
})
