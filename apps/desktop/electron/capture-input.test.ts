import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_INPUT, parseCaptureIndices } from './capture-input'

describe('parseCaptureIndices', () => {
  it('parses display and audio indices', () => {
    expect(parseCaptureIndices('2:1')).toEqual({ video: 2, audio: 1, camera: 0 })
  })

  it('parses an optional camera index', () => {
    expect(parseCaptureIndices('0:0:3')).toEqual({ video: 0, audio: 0, camera: 3 })
  })

  it('defaults camera to 0 when the third segment is empty', () => {
    expect(parseCaptureIndices('1:2:')).toEqual({ video: 1, audio: 2, camera: 0 })
  })

  it('falls back to default capture input when segments are invalid', () => {
    const [video, audio] = DEFAULT_CAPTURE_INPUT.split(':').map((v) => Number.parseInt(v, 10))
    expect(parseCaptureIndices('bad:input')).toEqual({ video, audio, camera: 0 })
    expect(parseCaptureIndices('1:not-a-number')).toEqual({ video, audio, camera: 0 })
  })
})
