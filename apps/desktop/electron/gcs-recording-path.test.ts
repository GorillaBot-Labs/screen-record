import { describe, expect, it } from 'vitest'
import { GCS_OBJECT_PREFIX, gcsPosterObjectName, gcsRecordingObjectName } from './gcs-recording-path'

describe('gcsRecordingObjectName', () => {
  it('prefixes the basename with the recordings folder', () => {
    expect(gcsRecordingObjectName('/tmp/screen-record/recording_2024.mp4')).toBe(
      `${GCS_OBJECT_PREFIX}/recording_2024.mp4`,
    )
    expect(gcsRecordingObjectName('recording_2024.mp4')).toBe(`${GCS_OBJECT_PREFIX}/recording_2024.mp4`)
  })
})

describe('gcsPosterObjectName', () => {
  it('places a jpeg poster beside the mp4 object', () => {
    expect(gcsPosterObjectName('recordings/recording_2024.mp4')).toBe(
      'recordings/recording_2024.poster.jpg',
    )
  })
})
