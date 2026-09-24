import type { CameraOverlaySize } from '../electron/overlay-bounds'

export const CAMERA_OVERLAY_SIZE_KEY = 'screen-record:cameraOverlaySize'

export function parseStoredCameraOverlaySize(raw: string | null | undefined): CameraOverlaySize {
  return raw === 'large' ? 'large' : 'small'
}
