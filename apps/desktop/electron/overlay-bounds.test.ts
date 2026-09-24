import { describe, expect, it } from 'vitest'
import {
  cameraOverlayDefaultBounds,
  cameraOverlayLayout,
  clampBoundsToWorkArea,
  recordingOverlayDefaultBounds,
} from './overlay-bounds'

const workArea = { x: 100, y: 50, width: 1800, height: 1000 }

describe('cameraOverlayLayout', () => {
  it('uses a square window matching the circle diameter', () => {
    expect(cameraOverlayLayout('small')).toEqual({ width: 180, height: 180, circle: 180 })
    expect(cameraOverlayLayout('large')).toEqual({ width: 270, height: 270, circle: 270 })
  })
})

describe('cameraOverlayDefaultBounds', () => {
  it('anchors the overlay to the bottom-left of the work area', () => {
    expect(cameraOverlayDefaultBounds('small', workArea)).toEqual({
      x: 120,
      y: 850,
      width: 180,
      height: 180,
    })
  })
})

describe('recordingOverlayDefaultBounds', () => {
  it('anchors the overlay to the top-left of the work area', () => {
    expect(recordingOverlayDefaultBounds(workArea)).toEqual({
      x: 112,
      y: 62,
      width: 420,
      height: 52,
    })
  })
})

describe('clampBoundsToWorkArea', () => {
  it('keeps bounds inside the work area with margin', () => {
    const clamped = clampBoundsToWorkArea(
      { x: 50, y: 10, width: 420, height: 52 },
      workArea,
      12,
    )
    expect(clamped).toEqual({ x: 112, y: 62, width: 420, height: 52 })
  })

  it('clamps positions that exceed the right and bottom edges', () => {
    const clamped = clampBoundsToWorkArea(
      { x: 2000, y: 2000, width: 420, height: 52 },
      workArea,
      12,
    )
    expect(clamped.x).toBe(1468)
    expect(clamped.y).toBe(986)
  })
})
