import path from 'node:path'
import { BrowserWindow, ipcMain, screen } from 'electron'

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
    return Promise.reject(new Error('Recording overlay paths not configured.'))
  }
  const { preloadPath, rendererDist, viteDevServerUrl } = paths

  return new Promise((resolve, reject) => {
    const d = displayForIndex(overlayPendingDisplayIndex)
    const area = d.workArea

    // Compact pill on the left edge of the recorded display.
    const width = 240
    const height = 54
    const marginX = 12
    const x = area.x + marginX
    const y = area.y + Math.round((area.height - height) / 2)

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
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

  ipcMain.handle('recordingOverlay:close', () => {
    destroyOverlayWindow()
  })
}

export function destroyRecordingOverlay(): void {
  destroyOverlayWindow()
}

