import path from 'node:path'
import { BrowserWindow, ipcMain, screen } from 'electron'

export type CountdownOverlayPaths = {
  preloadPath: string
  rendererDist: string
  viteDevServerUrl: string | undefined
}

let paths: CountdownOverlayPaths | null = null
let overlayWindow: BrowserWindow | null = null
/** Consumed by the `overlay:pull-initial` handler after the overlay page loads. */
let overlayPendingInitial: number | null = null
/** Target display index (as reported by sck-record) for the next overlay open. */
let overlayPendingDisplayIndex: number | null = null
/**
 * Skip is handled in the main process so countdown delays stay accurate while the
 * main BrowserWindow is minimized (Chromium heavily throttles renderer timers).
 */
let overlayCountdownSkipRequested = false

let ipcRegistered = false

function boundsForDisplayIndex(displayIndex: number | null): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return screen.getPrimaryDisplay().bounds
  if (typeof displayIndex !== 'number' || !Number.isFinite(displayIndex)) {
    return screen.getPrimaryDisplay().bounds
  }
  const i = Math.trunc(displayIndex)
  const d = displays[i]
  return d?.bounds ?? screen.getPrimaryDisplay().bounds
}

function destroyOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function sendOverlayCountdownValue(value: number) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.send('overlay:value', value)
}

function createOverlayWindow(): Promise<void> {
  if (!paths) {
    return Promise.reject(new Error('Countdown overlay paths not configured.'))
  }
  const { preloadPath, rendererDist, viteDevServerUrl } = paths

  return new Promise((resolve, reject) => {
    const bounds = boundsForDisplayIndex(overlayPendingDisplayIndex)
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
      reject(new Error(`Overlay did not load (${errorCode}): ${errorDescription}`))
    })

    if (viteDevServerUrl) {
      void win.loadURL(`${viteDevServerUrl}/overlay.html`)
    } else {
      void win.loadFile(path.join(rendererDist, 'overlay.html'))
    }
  })
}

/**
 * Registers `overlay:*` IPC handlers. Safe to call once at startup; subsequent calls are no-ops.
 */
export function registerCountdownOverlayIpc(p: CountdownOverlayPaths): void {
  if (ipcRegistered) return
  ipcRegistered = true
  paths = p

  ipcMain.handle(
    'overlay:open',
    async (
      _event,
      initial: unknown,
      displayIndex: unknown,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (typeof initial !== 'number' || !Number.isFinite(initial)) {
        return { ok: false, error: 'Invalid countdown value.' }
      }
      try {
        destroyOverlayWindow()
        overlayCountdownSkipRequested = false
        overlayPendingInitial = initial
        overlayPendingDisplayIndex =
          typeof displayIndex === 'number' && Number.isFinite(displayIndex) ? displayIndex : null
        await createOverlayWindow()
        return { ok: true }
      } catch (e) {
        overlayPendingInitial = null
        overlayPendingDisplayIndex = null
        destroyOverlayWindow()
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    },
  )

  ipcMain.handle('overlay:pull-initial', (event): number | null => {
    if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
      return null
    }
    const v = overlayPendingInitial
    overlayPendingInitial = null
    if (typeof v === 'number' && !overlayWindow.isDestroyed()) {
      overlayWindow.show()
    }
    return typeof v === 'number' ? v : null
  })

  ipcMain.handle('overlay:set', (_event, value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    sendOverlayCountdownValue(value)
  })

  ipcMain.handle('overlay:close', () => {
    destroyOverlayWindow()
  })

  ipcMain.on('overlay:skip-request', (event) => {
    if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
      return
    }
    overlayCountdownSkipRequested = true
  })

  ipcMain.handle('countdown:wait-ms', async (_event, ms: unknown): Promise<{ skipped: boolean }> => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > 120_000) {
      return { skipped: overlayCountdownSkipRequested }
    }
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (overlayCountdownSkipRequested) {
        return { skipped: true }
      }
      const remaining = deadline - Date.now()
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(50, Math.max(1, remaining)))
      })
    }
    return { skipped: overlayCountdownSkipRequested }
  })
}

/** Closes the overlay window if present (main window closed, app quit, etc.). */
export function destroyCountdownOverlay(): void {
  destroyOverlayWindow()
}
