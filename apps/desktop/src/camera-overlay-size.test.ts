import { describe, expect, it } from 'vitest'
import { parseStoredCameraOverlaySize } from './camera-overlay-size'

describe('parseStoredCameraOverlaySize', () => {
  it('returns large only for the exact stored value', () => {
    expect(parseStoredCameraOverlaySize('large')).toBe('large')
  })

  it('defaults to small for missing or unknown values', () => {
    expect(parseStoredCameraOverlaySize(null)).toBe('small')
    expect(parseStoredCameraOverlaySize(undefined)).toBe('small')
    expect(parseStoredCameraOverlaySize('')).toBe('small')
    expect(parseStoredCameraOverlaySize('SMALL')).toBe('small')
  })
})
