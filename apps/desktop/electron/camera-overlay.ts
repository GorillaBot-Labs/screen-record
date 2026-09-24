import path from 'node:path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import {
  type CameraOverlaySize,
  CAMERA_OVERLAY_MARGIN,
  cameraOverlayDefaultBounds,
  cameraOverlayLayout,
  clampBoundsToWorkArea,
} from './overlay-bounds'

export type CameraOverlayPaths = {
  preloadPath: string
  rendererDist: string
  viteDevServerUrl: string | undefined
}

let paths: CameraOverlayPaths | null = null
let overlayWindow: BrowserWindow | null = null

/** Camera device index for `getUserMedia`; `-1` means overlay should not open. */
let overlayPendingCameraIndex: number | null = null
let overlayPendingDisplayIndex: number | null = null

let ipcRegistered = false

export type { CameraOverlaySize } from './overlay-bounds'

/** Active display index for the open overlay window (used when resizing). */
let overlayActiveDisplayIndex: number | null = null
let overlayActiveSize: CameraOverlaySize = 'small'

function boundsForOverlay(size: CameraOverlaySize, displayIndex: number | null): Electron.Rectangle {
  return cameraOverlayDefaultBounds(size, displayForIndex(displayIndex).workArea, CAMERA_OVERLAY_MARGIN)
}

function clampBoundsToDisplay(
  bounds: Electron.Rectangle,
  displayIndex: number | null,
): Electron.Rectangle {
  return clampBoundsToWorkArea(bounds, displayForIndex(displayIndex).workArea, CAMERA_OVERLAY_MARGIN)
}

function applyOverlaySize(size: CameraOverlaySize): void {
  overlayActiveSize = size
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const current = overlayWindow.getBounds()
  const { width, height } = cameraOverlayLayout(size)
  const y = current.y + current.height - height
  overlayWindow.setBounds(
    clampBoundsToDisplay({ x: current.x, y, width, height }, overlayActiveDisplayIndex),
    false,
  )
}

function moveOverlayBy(deltaX: number, deltaY: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const current = overlayWindow.getBounds()
  overlayWindow.setBounds(
    clampBoundsToDisplay(
      { ...current, x: current.x + deltaX, y: current.y + deltaY },
      overlayActiveDisplayIndex,
    ),
    false,
  )
}

function displayForIndex(displayIndex: number | null): Electron.Display {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return screen.getPrimaryDisplay()
  if (typeof displayIndex !== 'number' || !Number.isFinite(displayIndex)) {
    return screen.getPrimaryDisplay()
  }
  const i = Math.trunc(displayIndex)
  return displays[i] ?? screen.getPrimaryDisplay()
}

function destroyOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function createOverlayWindow(): Promise<void> {
  if (!paths) {
    return Promise.reject(new Error('Camera overlay paths not configured.'))
  }
  const { preloadPath, rendererDist, viteDevServerUrl } = paths

  return new Promise((resolve, reject) => {
    overlayActiveDisplayIndex = overlayPendingDisplayIndex
    const bounds = boundsForOverlay(overlayActiveSize, overlayActiveDisplayIndex)

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: false,
      show: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      fullscreen: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    overlayWindow = win

    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setAlwaysOnTop(true, 'screen-saver')
    } else {
      win.setAlwaysOnTop(true)
    }

    win.on('closed', () => {
      if (overlayWindow === win) {
        overlayWindow = null
      }
    })

    win.webContents.once('did-finish-load', () => {
      resolve()
    })

    win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      if (overlayWindow === win) {
        destroyOverlayWindow()
      }
      reject(new Error(`Camera overlay did not load (${errorCode}): ${errorDescription}`))
    })

    if (viteDevServerUrl) {
      void win.loadURL(`${viteDevServerUrl}/camera-overlay.html`)
    } else {
      void win.loadFile(path.join(rendererDist, 'camera-overlay.html'))
    }
  })
}

export async function openCameraOverlay(
  cameraIndex: number,
  displayIndex: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(cameraIndex) || cameraIndex < 0) {
    return { ok: true }
  }
  try {
    destroyOverlayWindow()
    overlayPendingCameraIndex = Math.trunc(cameraIndex)
    overlayPendingDisplayIndex =
      typeof displayIndex === 'number' && Number.isFinite(displayIndex) ? displayIndex : null
    await createOverlayWindow()
    return { ok: true }
  } catch (e) {
    overlayPendingCameraIndex = null
    overlayPendingDisplayIndex = null
    destroyOverlayWindow()
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export function registerCameraOverlayIpc(p: CameraOverlayPaths): void {
  if (ipcRegistered) return
  ipcRegistered = true
  paths = p

  ipcMain.handle(
    'cameraOverlay:pull-initial',
    (event): { cameraIndex: number; size: CameraOverlaySize } | null => {
      if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
        return null
      }
      const v = overlayPendingCameraIndex
      overlayPendingCameraIndex = null
      if (typeof v === 'number' && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive()
      }
      if (typeof v !== 'number') return null
      return { cameraIndex: v, size: overlayActiveSize }
    },
  )

  ipcMain.handle(
    'cameraOverlay:set-size',
    (event, size: unknown): { ok: true; size: CameraOverlaySize } | { ok: false; error: string } => {
      if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
        return { ok: false, error: 'Camera overlay is not open.' }
      }
      if (size !== 'small' && size !== 'large') {
        return { ok: false, error: 'Invalid camera overlay size.' }
      }
      applyOverlaySize(size)
      return { ok: true, size }
    },
  )

  ipcMain.handle(
    'cameraOverlay:move-by',
    (event, deltaX: unknown, deltaY: unknown): { ok: true } | { ok: false; error: string } => {
      if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
        return { ok: false, error: 'Camera overlay is not open.' }
      }
      if (typeof deltaX !== 'number' || typeof deltaY !== 'number' || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
        return { ok: false, error: 'Invalid drag delta.' }
      }
      moveOverlayBy(deltaX, deltaY)
      return { ok: true }
    },
  )

  ipcMain.handle('cameraOverlay:close', () => {
    destroyOverlayWindow()
  })
}

export function destroyCameraOverlay(): void {
  overlayPendingCameraIndex = null
  overlayPendingDisplayIndex = null
  overlayActiveDisplayIndex = null
  destroyOverlayWindow()
}
