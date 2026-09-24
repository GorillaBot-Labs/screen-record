export type Rectangle = { x: number; y: number; width: number; height: number }
export type WorkArea = { x: number; y: number; width: number; height: number }

export type CameraOverlaySize = 'small' | 'large'

export const CAMERA_OVERLAY_MARGIN = 20
/** Transparent strip below the circle for the size toggle (must match CSS). */
export const CAMERA_OVERLAY_BOTTOM_OVERHANG = 38
export const CAMERA_OVERLAY_DIMENSIONS: Record<CameraOverlaySize, number> = {
  small: 180,
  large: 270,
}

export const RECORDING_OVERLAY_WIDTH = 420
export const RECORDING_OVERLAY_HEIGHT = 52
export const RECORDING_OVERLAY_MARGIN = 12

export function cameraOverlayLayout(size: CameraOverlaySize): {
  width: number
  height: number
  circle: number
} {
  const circle = CAMERA_OVERLAY_DIMENSIONS[size]
  return { width: circle, height: circle + CAMERA_OVERLAY_BOTTOM_OVERHANG, circle }
}

export function clampBoundsToWorkArea(
  bounds: Rectangle,
  workArea: WorkArea,
  margin: number,
): Rectangle {
  const maxX = workArea.x + workArea.width - bounds.width - margin
  const maxY = workArea.y + workArea.height - bounds.height - margin
  const minX = workArea.x + margin
  const minY = workArea.y + margin
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, minX), maxX),
    y: Math.min(Math.max(bounds.y, minY), maxY),
  }
}

export function cameraOverlayDefaultBounds(
  size: CameraOverlaySize,
  workArea: WorkArea,
  margin = CAMERA_OVERLAY_MARGIN,
): Rectangle {
  const { width, height } = cameraOverlayLayout(size)
  return {
    x: workArea.x + margin,
    y: workArea.y + workArea.height - height - margin,
    width,
    height,
  }
}

export function recordingOverlayDefaultBounds(
  workArea: WorkArea,
  margin = RECORDING_OVERLAY_MARGIN,
  width = RECORDING_OVERLAY_WIDTH,
  height = RECORDING_OVERLAY_HEIGHT,
): Rectangle {
  return {
    x: workArea.x + margin,
    y: workArea.y + margin,
    width,
    height,
  }
}
