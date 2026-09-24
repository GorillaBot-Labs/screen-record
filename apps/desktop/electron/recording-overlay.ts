import path from 'node:path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import {
  clampBoundsToWorkArea,
  RECORDING_OVERLAY_MARGIN,
  recordingOverlayDefaultBounds,
} from './overlay-bounds'

export type RecordingOverlayPaths = {
  preloadPath: string
  rendererDist: string
  viteDevServerUrl: string | undefined
}

let paths: RecordingOverlayPaths | null = null
let overlayWindow: BrowserWindow | null = null

/** Consumed by the `recordingOverlay:pull-initial` handler after the overlay page loads. */
let overlayPendingStartedAtMs: number | null = null
/** Target display index (as reported by sck-record) for the next overlay open. */
let overlayPendingDisplayIndex: number | null = null

let ipcRegistered = false

/** Target display for clamping drag bounds. */
let overlayActiveDisplayIndex: number | null = null

function displayForIndex(displayIndex: number | null): Electron.Display {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return screen.getPrimaryDisplay()
  if (typeof displayIndex !== 'number' || !Number.isFinite(displayIndex)) {
    return screen.getPrimaryDisplay()
  }
  const i = Math.trunc(displayIndex)
  return displays[i] ?? screen.getPrimaryDisplay()
}

function clampBoundsToDisplay(
  bounds: Electron.Rectangle,
  displayIndex: number | null,
): Electron.Rectangle {
  return clampBoundsToWorkArea(bounds, displayForIndex(displayIndex).workArea, RECORDING_OVERLAY_MARGIN)
}

function defaultOverlayBounds(displayIndex: number | null): Electron.Rectangle {
  return recordingOverlayDefaultBounds(displayForIndex(displayIndex).workArea, RECORDING_OVERLAY_MARGIN)
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

function destroyOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function createOverlayWindow(): Promise<void> {
  if (!paths) {
    return Promise.reject(new Error('Recording overlay paths not configured.'))
  }
  const { preloadPath, rendererDist, viteDevServerUrl } = paths

  return new Promise((resolve, reject) => {
    overlayActiveDisplayIndex = overlayPendingDisplayIndex
    const bounds = defaultOverlayBounds(overlayActiveDisplayIndex)

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      show: false,
      skipTaskbar: true,
      focusable: true,
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
      reject(new Error(`Recording overlay did not load (${errorCode}): ${errorDescription}`))
    })

    if (viteDevServerUrl) {
      void win.loadURL(`${viteDevServerUrl}/recording-overlay.html`)
    } else {
      void win.loadFile(path.join(rendererDist, 'recording-overlay.html'))
    }
  })
}

export async function openRecordingOverlay(
  startedAtMs: number,
  displayIndex: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) {
    return { ok: false, error: 'Invalid start time.' }
  }
  try {
    destroyOverlayWindow()
    overlayPendingStartedAtMs = startedAtMs
    overlayPendingDisplayIndex = typeof displayIndex === 'number' && Number.isFinite(displayIndex) ? displayIndex : null
    await createOverlayWindow()
    return { ok: true }
  } catch (e) {
    overlayPendingStartedAtMs = null
    overlayPendingDisplayIndex = null
    destroyOverlayWindow()
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export function registerRecordingOverlayIpc(p: RecordingOverlayPaths): void {
  if (ipcRegistered) return
  ipcRegistered = true
  paths = p

  ipcMain.handle(
    'recordingOverlay:open',
    async (
      _event,
      startedAtMs: unknown,
      displayIndex: unknown,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      return openRecordingOverlay(
        typeof startedAtMs === 'number' ? startedAtMs : Number.NaN,
        typeof displayIndex === 'number' ? displayIndex : null,
      )
    },
  )

  ipcMain.handle('recordingOverlay:pull-initial', (event): number | null => {
    if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
      return null
    }
    const v = overlayPendingStartedAtMs
    overlayPendingStartedAtMs = null
    if (typeof v === 'number' && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive()
    }
    return typeof v === 'number' ? v : null
  })

  ipcMain.handle(
    'recordingOverlay:move-by',
    (event, deltaX: unknown, deltaY: unknown): { ok: true } | { ok: false; error: string } => {
      if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
        return { ok: false, error: 'Recording overlay is not open.' }
      }
      if (typeof deltaX !== 'number' || typeof deltaY !== 'number' || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
        return { ok: false, error: 'Invalid drag delta.' }
      }
      moveOverlayBy(deltaX, deltaY)
      return { ok: true }
    },
  )

  ipcMain.handle('recordingOverlay:close', () => {
    destroyOverlayWindow()
  })
}

export function destroyRecordingOverlay(): void {
  overlayActiveDisplayIndex = null
  destroyOverlayWindow()
}

