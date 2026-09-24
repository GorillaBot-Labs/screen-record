import { describe, expect, it } from 'vitest'
import { isSafeHttpsRecordingUrl } from './safe-recording-url'

describe('isSafeHttpsRecordingUrl', () => {
  it('accepts public GCS HTTPS URLs', () => {
    expect(
      isSafeHttpsRecordingUrl('https://storage.googleapis.com/screen-record/recordings/foo.mp4'),
    ).toBe(true)
    expect(
      isSafeHttpsRecordingUrl('https://my-bucket.storage.googleapis.com/recordings/foo.mp4'),
    ).toBe(true)
  })

  it('rejects non-HTTPS and non-GCS hosts', () => {
    expect(isSafeHttpsRecordingUrl('http://storage.googleapis.com/foo.mp4')).toBe(false)
    expect(isSafeHttpsRecordingUrl('https://example.com/recording.mp4')).toBe(false)
    expect(isSafeHttpsRecordingUrl('https://evil-storage.googleapis.com.attacker.com/x')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isSafeHttpsRecordingUrl('not-a-url')).toBe(false)
    expect(isSafeHttpsRecordingUrl('')).toBe(false)
  })
})
