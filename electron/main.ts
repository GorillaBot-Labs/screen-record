import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from 'electron'
import { destroyCountdownOverlay, registerCountdownOverlayIpc } from './countdown-overlay'
import { uploadRecordingToGcs } from './gcs-upload'
import { readRecentRecordingUrls, recordSuccessfulUploadUrl } from './recent-recordings'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const appRoot = path.join(__dirname, '..')
process.env.APP_ROOT = appRoot

// Default bucket if unset (override with `GCS_BUCKET` for another bucket).
if (!process.env.GCS_BUCKET?.trim()) {
  process.env.GCS_BUCKET = 'screen-record'
}

// GCP service account JSON — fixed path under home; create `~/.screen-record/` and drop `gcp-credentials.json` there.
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(homedir(), '.screen-record', 'gcp-credentials.json')

const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
const rendererDist = path.join(appRoot, 'dist')

registerCountdownOverlayIpc({
  preloadPath: path.join(__dirname, 'preload.mjs'),
  rendererDist,
  viteDevServerUrl,
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

let recordingStartedAtMs: number | null = null
let trayRecordingTick: ReturnType<typeof setInterval> | null = null

/** Default `displayIndex:audioIndex` when the renderer omits `captureInput`. */
const DEFAULT_CAPTURE_INPUT = '0:0'

type CaptureDevice = { index: number; name: string }

let recordingChild: ChildProcess | null = null

function resolveSckRecorderPath(): string | null {
  if (process.platform !== 'darwin') return null
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'sck-record')
    return existsSync(p) ? p : null
  }
  const dev = path.join(appRoot, 'native', 'sck-record', '.build', 'release', 'sck-record')
  return existsSync(dev) ? dev : null
}

function listSckDevicesSync(
  sckPath: string,
): { video: CaptureDevice[]; audio: CaptureDevice[] } | null {
  const r = spawnSync(sckPath, ['--list-json'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 25_000,
  })
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null
  const trimmed = r.stdout.trim()
  if (trimmed.length === 0) return null
  try {
    const o = JSON.parse(trimmed) as { video?: CaptureDevice[]; audio?: CaptureDevice[] }
    if (!Array.isArray(o.video) || !Array.isArray(o.audio)) return null
    return { video: o.video, audio: o.audio }
  } catch {
    return null
  }
}

function parseCaptureIndices(input: string): { video: number; audio: number } {
  const parts = input.split(':')
  const video = Number.parseInt(parts[0] ?? '', 10)
  const audio = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isNaN(video) || Number.isNaN(audio)) {
    const [dv, da] = DEFAULT_CAPTURE_INPUT.split(':')
    return { video: Number.parseInt(dv!, 10), audio: Number.parseInt(da!, 10) }
  }
  return { video, audio }
}

/** Temp staging dir for recorder output; file is removed after a successful GCS upload. */
function recordingStagingDir(): string {
  return path.join(tmpdir(), 'screen-record')
}

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return path.join(recordingStagingDir(), `recording_${stamp}.mp4`)
}

function notifyShareLinkCopied(): void {
  if (!Notification.isSupported()) return
  new Notification({
    title: 'Recording ready',
    body: 'Your share link was copied to the clipboard.',
  }).show()
}

function trayIconImage(): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), 'resources', 'trayTemplate.png')
  if (existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath)
    if (process.platform === 'darwin') {
      img.setTemplateImage(true)
    }
    return img
  }
  const empty = nativeImage.createEmpty()
  return empty
}

function clearTrayRecordingTick() {
  if (trayRecordingTick) {
    clearInterval(trayRecordingTick)
    trayRecordingTick = null
  }
}

/** `mm:ss` or `h:mm:ss` for the tray title / tooltip while recording. */
function formatRecordingElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function applyTrayRecordingPresentation() {
  if (!tray) return
  const active = Boolean(recordingChild && !recordingChild.killed)
  if (!active || recordingStartedAtMs == null) {
    tray.setToolTip('Screen Record')
    if (process.platform === 'darwin') {
      tray.setTitle('')
    }
    return
  }
  const elapsed = Date.now() - recordingStartedAtMs
  const dur = formatRecordingElapsed(elapsed)
  tray.setToolTip(`Recording — ${dur}`)
  if (process.platform === 'darwin') {
    tray.setTitle(` \u25CF ${dur}`)
  }
}

function startTrayRecordingPresentation() {
  recordingStartedAtMs = Date.now()
  clearTrayRecordingTick()
  applyTrayRecordingPresentation()
  trayRecordingTick = setInterval(applyTrayRecordingPresentation, 1000)
}

function stopTrayRecordingPresentation() {
  clearTrayRecordingTick()
  recordingStartedAtMs = null
  applyTrayRecordingPresentation()
}

function createTray() {
  if (tray) return
  const icon = trayIconImage()
  if (icon.isEmpty()) {
    console.warn('Tray icon missing at resources/trayTemplate.png; menu bar item not created.')
    return
  }
  tray = new Tray(icon)
  tray.setToolTip('Screen Record')
  updateTrayMenu()
}

function sendTrayStartRecordingToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  }
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const send = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('recording:tray-start-request')
    }
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function updateTrayMenu() {
  if (!tray) return
  const recording = Boolean(recordingChild && !recordingChild.killed)
  const template: Electron.MenuItemConstructorOptions[] = []
  if (recording) {
    template.push({
      label: '● Recording',
      enabled: false,
    })
    template.push({ type: 'separator' })
  }
  template.push(
    {
      label: 'Open Screen Record',
      click: () => {
        showMainWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Start Recording',
      enabled: !recording,
      click: () => {
        void sendTrayStartRecordingToRenderer()
      },
    },
    {
      label: 'Stop Recording',
      enabled: recording,
      click: () => {
        void stopRecordingChild()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  )
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    destroyCountdownOverlay()
  })

  if (viteDevServerUrl) {
    mainWindow.loadURL(viteDevServerUrl)
  } else {
    mainWindow.loadFile(path.join(rendererDist, 'index.html'))
  }
}

function forwardStderrToRenderer(sender: Electron.WebContents, chunk: Buffer | string) {
  if (sender.isDestroyed()) return
  sender.send('recording:stderr', typeof chunk === 'string' ? chunk : chunk.toString())
}

function forwardRecordingEnded(sender: Electron.WebContents, payload: { code: number | null; signal: NodeJS.Signals | null }) {
  if (sender.isDestroyed()) return
  sender.send('recording:ended', payload)
}

/** Sends SIGINT to the active sck-record process. */
function stopRecordingChild(): { ok: true } | { ok: false; error: string } {
  const child = recordingChild
  if (!child || child.killed) {
    return { ok: false, error: 'Not recording.' }
  }
  child.kill('SIGINT')
  return { ok: true }
}

ipcMain.handle('recording:resolveSck', (): { path: string } | { path: null; error: string } => {
  const resolved = resolveSckRecorderPath()
  if (resolved) return { path: resolved }
  return {
    path: null,
    error:
      'sck-record not found. From the repo root run: npm run build:native (needs Xcode / Swift). Packaged apps include the binary under Resources.',
  }
})

ipcMain.handle(
  'recording:listCaptureDevices',
  async (): Promise<
    | { ok: true; video: CaptureDevice[]; audio: CaptureDevice[] }
    | { ok: false; error: string }
  > => {
    if (process.platform !== 'darwin') {
      return { ok: false, error: 'Screen recording is only supported on macOS.' }
    }
    const sckPath = resolveSckRecorderPath()
    if (!sckPath) {
      return {
        ok: false,
        error:
          'Native recorder (sck-record) is missing. Run `npm run build:native` from the project root, then refresh.',
      }
    }
    const listed = listSckDevicesSync(sckPath)
    if (listed && (listed.video.length > 0 || listed.audio.length > 0)) {
      return { ok: true, video: listed.video, audio: listed.audio }
    }
    return {
      ok: false,
      error:
        'Could not list displays or microphones (sck-record --list-json failed). Grant Screen Recording if prompted, then try again.',
    }
  },
)

ipcMain.handle(
  'recording:start',
  async (
    event,
    options: { captureInput?: string } = {},
  ): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> => {
    if (recordingChild) {
      return { ok: false, error: 'Recording already in progress.' }
    }

    if (process.platform !== 'darwin') {
      return { ok: false, error: 'Recording is only supported on macOS.' }
    }

    const sckPath = resolveSckRecorderPath()
    if (!sckPath) {
      return {
        ok: false,
        error:
          'Native recorder (sck-record) is missing. Run `npm run build:native` from the project root, then try again.',
      }
    }

    const captureInput = options.captureInput?.trim() || DEFAULT_CAPTURE_INPUT
    const { video: displayIdx, audio: audioIdx } = parseCaptureIndices(captureInput)
    const outputPath = defaultOutputPath()

    try {
      mkdirSync(recordingStagingDir(), { recursive: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: `Could not create temp recording directory: ${msg}` }
    }

    const child = spawn(
      sckPath,
      ['--output', outputPath, '--display', String(displayIdx), '--audio', String(audioIdx)],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )

    recordingChild = child
    startTrayRecordingPresentation()

    const sender = event.sender
    forwardStderrToRenderer(sender, 'Using ScreenCaptureKit (sck-record).\n')
    child.stderr?.on('data', (chunk: Buffer) => {
      forwardStderrToRenderer(sender, chunk)
    })

    child.on('error', (err) => {
      if (recordingChild === child) {
        recordingChild = null
      }
      forwardStderrToRenderer(sender, `Recorder process error: ${err.message}\n`)
      stopTrayRecordingPresentation()
      updateTrayMenu()
      showMainWindow()
    })

    child.on('close', (code, signal) => {
      if (recordingChild === child) {
        recordingChild = null
      }
      stopTrayRecordingPresentation()
      forwardRecordingEnded(sender, { code, signal })
      updateTrayMenu()
      showMainWindow()

      void (async () => {
        if (!existsSync(outputPath)) {
          if (!sender.isDestroyed()) {
            sender.send('recording:gcs-upload', {
              ok: false,
              error: 'Output file was not found after recording stopped.',
              outputPath,
            })
          }
          return
        }
        const result = await uploadRecordingToGcs(outputPath)
        if (sender.isDestroyed()) return
        let localFileDeleted = false
        if (result.ok) {
          recordSuccessfulUploadUrl(result.url)
          clipboard.writeText(result.url)
          notifyShareLinkCopied()
          try {
            unlinkSync(outputPath)
            localFileDeleted = true
          } catch {
            /* temp file may already be gone; upload succeeded */
          }
        }
        sender.send('recording:gcs-upload', {
          ok: result.ok,
          outputPath,
          ...(result.ok
            ? { url: result.url, ...(localFileDeleted ? { localFileDeleted: true as const } : {}) }
            : { error: result.error }),
        })
      })()
    })

    updateTrayMenu()
    return { ok: true, outputPath }
  })

ipcMain.handle('window:minimize', (): { ok: true } | { ok: false; error: string } => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'No window to minimize.' }
  }
  mainWindow.minimize()
  return { ok: true }
})

ipcMain.handle('recording:stop', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  const res = stopRecordingChild()
  if (res.ok) {
    updateTrayMenu()
  }
  return res
})

ipcMain.handle('recordings:listRecent', (): { urls: string[] } => {
  return { urls: readRecentRecordingUrls() }
})

function isSafeHttpsRecordingUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.hostname === 'storage.googleapis.com') return true
    if (u.hostname.endsWith('.storage.googleapis.com')) return true
    return false
  } catch {
    return false
  }
}

ipcMain.handle(
  'shell:openExternal',
  async (_event, url: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (typeof url !== 'string' || url.trim().length === 0) {
      return { ok: false, error: 'Invalid URL.' }
    }
    const trimmed = url.trim()
    if (!isSafeHttpsRecordingUrl(trimmed)) {
      return { ok: false, error: 'Only HTTPS storage links can be opened from here.' }
    }
    try {
      await shell.openExternal(trimmed)
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  },
)

function isPathInsideRecordingStagingDir(filePath: string): boolean {
  const abs = path.resolve(filePath)
  const root = path.resolve(recordingStagingDir())
  return abs === root || abs.startsWith(root + path.sep)
}

ipcMain.handle(
  'recording:revealInFinder',
  async (_event, filePath: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      return { ok: false, error: 'Invalid path.' }
    }
    const abs = path.resolve(filePath.trim())
    if (!isPathInsideRecordingStagingDir(abs)) {
      return { ok: false, error: 'Path must be inside the app temp recording folder.' }
    }
    if (!existsSync(abs)) {
      return { ok: false, error: 'File or folder not found.' }
    }
    shell.showItemInFolder(abs)
    return { ok: true }
  },
)

function stopRecordingOnQuit() {
  destroyCountdownOverlay()
  if (recordingChild && !recordingChild.killed) {
    recordingChild.kill('SIGINT')
  }
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('before-quit', stopRecordingOnQuit)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  showMainWindow()
})
