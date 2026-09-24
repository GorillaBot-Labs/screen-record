import { describe, expect, it } from 'vitest'
import { formatRecordingElapsed } from './format-recording-elapsed'

describe('formatRecordingElapsed', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatRecordingElapsed(0)).toBe('0:00')
    expect(formatRecordingElapsed(5_000)).toBe('0:05')
    expect(formatRecordingElapsed(65_000)).toBe('1:05')
    expect(formatRecordingElapsed(3_599_000)).toBe('59:59')
  })

  it('formats hour-plus durations as h:mm:ss', () => {
    expect(formatRecordingElapsed(3_600_000)).toBe('1:00:00')
    expect(formatRecordingElapsed(3_661_000)).toBe('1:01:01')
    expect(formatRecordingElapsed(10_000_000)).toBe('2:46:40')
  })

  it('never shows negative elapsed time', () => {
    expect(formatRecordingElapsed(-30_000)).toBe('0:00')
  })
})
