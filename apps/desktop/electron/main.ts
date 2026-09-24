import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import dotenv from 'dotenv'
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
import { destroyCameraOverlay, openCameraOverlay, registerCameraOverlayIpc } from './camera-overlay'
import { destroyRecordingOverlay, openRecordingOverlay, registerRecordingOverlayIpc } from './recording-overlay'
import { DEFAULT_CAPTURE_INPUT, parseCaptureIndices } from './capture-input'
import { ensureSupportedMacOs } from './macos-version'
import { uploadRecordingToGcs } from './gcs-upload'
import { recordingElapsedSeconds } from './recording-duration'
import { formatRecordingElapsed } from './format-recording-elapsed'
import { isPathInsideRecordingStagingDir, recordingStagingDir } from './recording-staging'
import { purgeLegacyRecentRecordingStore } from './recent-recordings'
import { isSafeHttpsRecordingUrl } from './safe-recording-url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const appRoot = path.join(__dirname, '..')
process.env.APP_ROOT = appRoot

/**
 * Load desktop env vars without requiring `export ...` in the shell.
 *
 * Precedence (last wins):
 * - Dev: `apps/desktop/.env`
 * - Packaged app: `apps/desktop/.env.production` (bundled at build time)
 * - `~/.screen-record/.env` optional override
 */
function loadDesktopEnv(): void {
  const candidates = [
    path.join(appRoot, app.isPackaged ? '.env.production' : '.env'),
    path.join(homedir(), '.screen-record', '.env'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    dotenv.config({ path: p, override: true })
  }
}

loadDesktopEnv()

if (!process.env.WEB_APP_BASE_URL?.trim()) {
  const appUrl = process.env.APP_URL?.trim()
  if (appUrl) {
    process.env.WEB_APP_BASE_URL = appUrl.replace(/\/+$/, '')
  }
}

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

registerRecordingOverlayIpc({
  preloadPath: path.join(__dirname, 'preload.mjs'),
  rendererDist,
  viteDevServerUrl,
})

registerCameraOverlayIpc({
  preloadPath: path.join(__dirname, 'preload.mjs'),
  rendererDist,
  viteDevServerUrl,
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

let recordingStartedAtMs: number | null = null
let trayRecordingTick: ReturnType<typeof setInterval> | null = null
let lastShareUrl: string | null = null

type CaptureDevice = { index: number; name: string; displayId?: number }

let recordingChild: ChildProcess | null = null
let recordingOutputPath: string | null = null
let recordingWasCancelled = false
let recordingPaused = false
let restartPending = false
let recordingPausedAtMs: number | null = null
let recordingPausedTotalMs = 0

function resolveSckRecorderPath(): string | null {
  if (process.platform !== 'darwin') return null
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'sck-record')
    return existsSync(p) ? p : null
  }
  const dev = path.join(appRoot, 'native', 'sck-record', '.build', 'release', 'sck-record')
  return existsSync(dev) ? dev : null
}

ipcMain.handle('system:getInfo', () => {
  const sysVer = typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : null
  return {
    platform: process.platform,
    arch: process.arch,
    systemVersion: sysVer,
    isPackaged: app.isPackaged,
    execPath: process.execPath,
  }
})

type SpawnResult = { status: number | null; stdout: string; stderr: string; timedOut: boolean }

function spawnCollectUtf8(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; maxBytes: number },
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let timedOut = false

    const killTimer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, opts.timeoutMs)

    const finish = (status: number | null) => {
      clearTimeout(killTimer)
      resolve({
        status,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
      })
    }

    child.stdout?.on('data', (b: Buffer) => {
      outBytes += b.length
      if (outBytes + errBytes > opts.maxBytes) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
        return
      }
      out.push(b)
    })
    child.stderr?.on('data', (b: Buffer) => {
      errBytes += b.length
      if (outBytes + errBytes > opts.maxBytes) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
        return
      }
      err.push(b)
    })
    child.on('close', (code) => finish(code))
    child.on('error', () => finish(1))
  })
}

let cachedDevices:
  | { atMs: number; data: { video: CaptureDevice[]; audio: CaptureDevice[]; cameras: CaptureDevice[] } }
  | null = null

async function listSckDevices(
  sckPath: string,
  opts: { cacheMaxAgeMs: number } = { cacheMaxAgeMs: 2000 },
): Promise<{ video: CaptureDevice[]; audio: CaptureDevice[]; cameras: CaptureDevice[] } | null> {
  const now = Date.now()
  if (cachedDevices && now - cachedDevices.atMs <= opts.cacheMaxAgeMs) {
    return cachedDevices.data
  }
  const r = await spawnCollectUtf8(sckPath, ['--list-json'], {
    timeoutMs: 25_000,
    maxBytes: 4 * 1024 * 1024,
  })
  if (r.timedOut || r.status !== 0) return null
  const trimmed = r.stdout.trim()
  if (trimmed.length === 0) return null
  try {
    const o = JSON.parse(trimmed) as {
      video?: CaptureDevice[]
      audio?: CaptureDevice[]
      cameras?: CaptureDevice[]
    }
    if (!Array.isArray(o.video) || !Array.isArray(o.audio)) return null
    const data = {
      video: o.video,
      audio: o.audio,
      cameras: Array.isArray(o.cameras) ? o.cameras : [],
    }
    cachedDevices = { atMs: now, data }
    return data
  } catch {
    return null
  }
}

async function captureDisplayScreenshot(
  sckPath: string,
  displayIndex: number,
  params: { maxWidth?: number; timeoutMs?: number } = {},
): Promise<{ ok: true; pngBase64: string; width: number; height: number } | { ok: false; error: string }> {
  const maxWidth = params.maxWidth ?? 640
  // Keep UI responsive: on blocked permission we want a fast fail, not a long main-process stall.
  const timeoutMs = params.timeoutMs ?? 2200

  const r = await spawnCollectUtf8(
    sckPath,
    ['--screenshot-json', '--display', String(displayIndex), '--max-width', String(maxWidth)],
    { timeoutMs, maxBytes: 8 * 1024 * 1024 },
  )
  if (r.timedOut) {
    return {
      ok: false,
      error:
        'Screenshot failed: timed out waiting for first frame (check Screen Recording permission)',
    }
  }
  if (r.status !== 0) {
    const errMsg = r.stderr.trim().length > 0 ? r.stderr.trim() : 'sck-record screenshot failed.'
    return { ok: false, error: errMsg }
  }
  const trimmed = r.stdout.trim()
  if (trimmed.length === 0) return { ok: false, error: 'Empty screenshot response.' }
  try {
    const o = JSON.parse(trimmed) as {
      ok?: boolean
      pngBase64?: string
      width?: number
      height?: number
    }
    if (!o.ok || typeof o.pngBase64 !== 'string' || typeof o.width !== 'number' || typeof o.height !== 'number') {
      return { ok: false, error: 'Invalid screenshot JSON.' }
    }
    return { ok: true, pngBase64: o.pngBase64, width: o.width, height: o.height }
  } catch {
    return { ok: false, error: 'Could not parse screenshot JSON.' }
  }
}

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return path.join(recordingStagingDir(), `recording_${stamp}.mp4`)
}

type WebIngestResult =
  | { ok: true; detailUrl: string; title?: string }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'request_failed'; error: string }

function notifyRecordingReady(detailUrl: string | undefined): void {
  if (!Notification.isSupported()) return
  if (detailUrl) {
    new Notification({
      title: 'Recording ready',
      body: 'Opening your recording in the browser.',
    }).show()
    return
  }
  new Notification({
    title: 'Recording uploaded',
    body: 'Uploaded to cloud storage, but no web share link was created. Check ~/.screen-record/.env.',
  }).show()
}

/** Tell the local web app to upsert the Mongo row; secret must match web `DESKTOP_INGEST_SECRET`. */
async function ingestRecordingToWeb(
  gcsObjectName: string,
  publicUrl: string,
  durationSeconds?: number,
): Promise<WebIngestResult> {
  const base = process.env.WEB_APP_BASE_URL?.trim()?.replace(/\/+$/, '')
  const secret = process.env.DESKTOP_INGEST_SECRET?.trim()
  if (!base || !secret) return { ok: false, reason: 'not_configured' }
  try {
    const res = await fetch(`${base}/api/recordings/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-ingest-secret': secret },
      body: JSON.stringify({
        gcsObjectName,
        publicUrl,
        ...(durationSeconds != null ? { durationSeconds } : {}),
      }),
    })
    if (!res.ok) {
      let error = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: unknown }
        if (typeof j.error === 'string' && j.error.trim()) error = j.error.trim()
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'request_failed', error }
    }
    const j = (await res.json()) as { ok?: unknown; detailUrl?: unknown; title?: unknown }
    const detailUrl = typeof j.detailUrl === 'string' ? j.detailUrl.trim() : ''
    if (!detailUrl) {
      return { ok: false, reason: 'request_failed', error: 'Web app did not return a share link.' }
    }
    const title = typeof j.title === 'string' ? j.title.trim() : undefined
    return { ok: true, detailUrl, ...(title ? { title } : {}) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: 'request_failed', error: msg }
  }
}

function appIconImage(): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }
  return nativeImage.createEmpty()
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
  const now = Date.now()
  const pauseExtra = recordingPausedAtMs != null ? now - recordingPausedAtMs : 0
  const elapsed = Math.max(0, now - recordingStartedAtMs - recordingPausedTotalMs - pauseExtra)
  const dur = formatRecordingElapsed(elapsed)
  tray.setToolTip(recordingPaused ? `Paused — ${dur}` : `Recording — ${dur}`)
  if (process.platform === 'darwin') {
    tray.setTitle(recordingPaused ? ` \u275A\u275A ${dur}` : ` \u25CF ${dur}`)
  }
}

function startTrayRecordingPresentation() {
  recordingStartedAtMs = Date.now()
  recordingPaused = false
  recordingPausedAtMs = null
  recordingPausedTotalMs = 0
  clearTrayRecordingTick()
  applyTrayRecordingPresentation()
  trayRecordingTick = setInterval(applyTrayRecordingPresentation, 1000)
}

function stopTrayRecordingPresentation() {
  clearTrayRecordingTick()
  recordingStartedAtMs = null
  recordingPaused = false
  recordingPausedAtMs = null
  recordingPausedTotalMs = 0
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
    {
      label: 'Cancel Recording',
      enabled: recording,
      click: () => {
        void cancelRecordingChild()
      },
    },
    { type: 'separator' },
    {
      label: 'Open library',
      enabled: Boolean(process.env.WEB_APP_BASE_URL?.trim()),
      click: () => {
        const base = process.env.WEB_APP_BASE_URL?.trim()?.replace(/\/+$/, '')
        if (!base) return
        void shell.openExternal(`${base}/`)
      },
    },
    {
      label: 'Copy last share link',
      enabled: Boolean(lastShareUrl),
      click: () => {
        if (!lastShareUrl) return
        clipboard.writeText(lastShareUrl)
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
  const icon = appIconImage()
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 380,
    minHeight: 560,
    ...(icon.isEmpty() ? {} : { icon }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    destroyCountdownOverlay()
    destroyRecordingOverlay()
    destroyCameraOverlay()
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

function forwardRecordingEnded(
  sender: Electron.WebContents,
  payload: { code: number | null; signal: NodeJS.Signals | null; cancelled?: boolean },
) {
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

/**
 * Aborts the active recording session.
 * - Stops the recorder immediately
 * - Skips upload
 * - Deletes any partial output file
 */
function cancelRecordingChild(): { ok: true } | { ok: false; error: string } {
  const child = recordingChild
  if (!child || child.killed) {
    return { ok: false, error: 'Not recording.' }
  }
  recordingWasCancelled = true
  recordingPaused = false
  recordingPausedAtMs = null
  recordingPausedTotalMs = 0
  try {
    child.kill('SIGKILL')
  } catch {
    // If SIGKILL is not supported, fall back to SIGINT.
    try {
      child.kill('SIGINT')
    } catch {
      /* ignore */
    }
  }
  return { ok: true }
}

function pauseRecordingChild(): { ok: true } | { ok: false; error: string } {
  const child = recordingChild
  if (!child || child.killed) return { ok: false, error: 'Not recording.' }
  if (recordingPaused) return { ok: true }
  try {
    child.kill('SIGSTOP')
    recordingPaused = true
    recordingPausedAtMs = Date.now()
    clearTrayRecordingTick()
    applyTrayRecordingPresentation()
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

function resumeRecordingChild(): { ok: true } | { ok: false; error: string } {
  const child = recordingChild
  if (!child || child.killed) return { ok: false, error: 'Not recording.' }
  if (!recordingPaused) return { ok: true }
  try {
    child.kill('SIGCONT')
    recordingPaused = false
    if (recordingPausedAtMs != null) {
      recordingPausedTotalMs += Date.now() - recordingPausedAtMs
      recordingPausedAtMs = null
    }
    clearTrayRecordingTick()
    applyTrayRecordingPresentation()
    trayRecordingTick = setInterval(applyTrayRecordingPresentation, 1000)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
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
    | { ok: true; video: CaptureDevice[]; audio: CaptureDevice[]; cameras: CaptureDevice[] }
    | { ok: false; error: string }
  > => {
    const supported = ensureSupportedMacOs()
    if (!supported.ok) return supported
    const sckPath = resolveSckRecorderPath()
    if (!sckPath) {
      return {
        ok: false,
        error:
          'Native recorder (sck-record) is missing. Run `npm run build:native` from the project root, then refresh.',
      }
    }
    const listed = await listSckDevices(sckPath)
    if (listed && (listed.video.length > 0 || listed.audio.length > 0)) {
      return { ok: true, video: listed.video, audio: listed.audio, cameras: listed.cameras }
    }
    return {
      ok: false,
      error:
        'Could not list displays or microphones (sck-record --list-json failed). Grant Screen Recording if prompted, then try again.',
    }
  },
)

ipcMain.handle(
  'recording:captureDisplayScreenshot',
  async (_event, displayIndex: unknown): Promise<
    | { ok: true; pngBase64: string; width: number; height: number }
    | { ok: false; error: string }
  > => {
    const supported = ensureSupportedMacOs()
    if (!supported.ok) return supported
    if (typeof displayIndex !== 'number' || !Number.isFinite(displayIndex)) {
      return { ok: false, error: 'Invalid display selector.' }
    }
    const sckPath = resolveSckRecorderPath()
    if (!sckPath) {
      return {
        ok: false,
        error:
          'Native recorder (sck-record) is missing. Run `npm run build:native` from the project root, then refresh.',
      }
    }

    // Renderer may pass either the "display index" (0..N-1) or a ScreenCaptureKit displayId.
    // `sck-record --screenshot-json` expects an index, so map displayId → index when needed.
    let idx = displayIndex
    const listed = await listSckDevices(sckPath)
    if (listed?.video?.length) {
      const asIndex = listed.video.some((d) => d.index === displayIndex)
      if (!asIndex) {
        const asDisplayId = listed.video.find((d) => d.displayId === displayIndex)
        if (asDisplayId) idx = asDisplayId.index
      }
    }

    return captureDisplayScreenshot(sckPath, idx, { maxWidth: 760 })
  },
)

ipcMain.handle(
  'recording:start',
  async (
    event,
    options: { captureInput?: string } = {},
  ): Promise<
    | { ok: true; outputPath: string; recordingStartedAtMs: number }
    | { ok: false; error: string }
  > => {
    if (recordingChild) {
      return { ok: false, error: 'Recording already in progress.' }
    }

    const supported = ensureSupportedMacOs()
    if (!supported.ok) return supported

    const sckPath = resolveSckRecorderPath()
    if (!sckPath) {
      return {
        ok: false,
        error:
          'Native recorder (sck-record) is missing. Run `npm run build:native` from the project root, then try again.',
      }
    }

    const captureInput = options.captureInput?.trim() || DEFAULT_CAPTURE_INPUT
    const { video: displayIdx, audio: audioIdx, camera: cameraIdx } = parseCaptureIndices(captureInput)
    const outputPath = defaultOutputPath()

    try {
      mkdirSync(recordingStagingDir(), { recursive: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: `Could not create temp recording directory: ${msg}` }
    }

    const spawnArgs = [
      '--output',
      outputPath,
      '--display',
      String(displayIdx),
      '--audio',
      String(audioIdx),
      '--exclude-pid',
      String(process.pid),
    ]
    if (cameraIdx >= 0) {
      spawnArgs.push('--camera', String(cameraIdx))
    }
    const child = spawn(sckPath, spawnArgs, { stdio: ['ignore', 'ignore', 'pipe'] })

    recordingChild = child
    recordingOutputPath = outputPath
    recordingWasCancelled = false
    startTrayRecordingPresentation()
    const startedAtMs = recordingStartedAtMs ?? Date.now()

    void openRecordingOverlay(startedAtMs, displayIdx)
    if (cameraIdx >= 0) {
      void openCameraOverlay(cameraIdx, displayIdx)
    }

    const sender = event.sender
    forwardStderrToRenderer(sender, 'Using ScreenCaptureKit (sck-record).\n')
    child.stderr?.on('data', (chunk: Buffer) => {
      forwardStderrToRenderer(sender, chunk)
    })

    child.on('error', (err) => {
      if (recordingChild === child) {
        recordingChild = null
      }
      if (recordingOutputPath === outputPath) {
        recordingOutputPath = null
      }
      forwardStderrToRenderer(sender, `Recorder process error: ${err.message}\n`)
      stopTrayRecordingPresentation()
      destroyRecordingOverlay()
      destroyCameraOverlay()
      updateTrayMenu()
      showMainWindow()
    })

    child.on('close', (code, signal) => {
      if (recordingChild === child) {
        recordingChild = null
      }
      recordingPaused = false
      const wasCancelled = recordingWasCancelled
      if (recordingOutputPath === outputPath) {
        recordingOutputPath = null
      }
      recordingWasCancelled = false
      const endedAtMs = Date.now()
      const durationSeconds =
        recordingStartedAtMs != null
          ? recordingElapsedSeconds({
              startedAtMs: recordingStartedAtMs,
              endedAtMs,
              pausedTotalMs: recordingPausedTotalMs,
              pausedAtMs: recordingPausedAtMs,
            })
          : undefined
      stopTrayRecordingPresentation()
      destroyRecordingOverlay()
      destroyCameraOverlay()
      forwardRecordingEnded(sender, { code, signal, ...(wasCancelled ? { cancelled: true } : {}) })
      updateTrayMenu()
      showMainWindow()

      if (restartPending) {
        restartPending = false
        // Kick off the normal renderer start sequence (includes countdown + minimize).
        setTimeout(() => {
          void sendTrayStartRecordingToRenderer()
        }, 150)
      }

      void (async () => {
        if (wasCancelled) {
          try {
            if (existsSync(outputPath)) {
              unlinkSync(outputPath)
            }
          } catch {
            /* ignore */
          }
          return
        }
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
        let detailUrl: string | undefined
        let ingestError: string | undefined
        if (result.ok) {
          const gcsUrl = result.url
          const ingest = await ingestRecordingToWeb(
            result.objectName,
            gcsUrl,
            durationSeconds,
          )
          if (ingest.ok) {
            detailUrl = ingest.detailUrl
          } else if (ingest.reason === 'request_failed') {
            ingestError = ingest.error
          } else if (ingest.reason === 'not_configured') {
            ingestError =
              'Web app not configured. Set WEB_APP_BASE_URL and DESKTOP_INGEST_SECRET in ~/.screen-record/.env.'
          }

          if (detailUrl) {
            lastShareUrl = detailUrl
            clipboard.writeText(detailUrl)
          } else {
            lastShareUrl = null
          }
          updateTrayMenu()
          notifyRecordingReady(detailUrl)
          if (detailUrl) {
            try {
              await shell.openExternal(detailUrl)
            } catch {
              /* ignore */
            }
          }
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
            ? {
                gcsUrl: result.url,
                gcsObjectName: result.objectName,
                ...(detailUrl ? { url: detailUrl, detailUrl } : {}),
                ...(ingestError ? { ingestError } : {}),
                ...(localFileDeleted ? { localFileDeleted: true as const } : {}),
              }
            : { error: result.error }),
        })
      })()
    })

    updateTrayMenu()
    return { ok: true, outputPath, recordingStartedAtMs: startedAtMs }
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

ipcMain.handle('recording:cancel', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  restartPending = false
  const res = cancelRecordingChild()
  if (res.ok) {
    updateTrayMenu()
  }
  return res
})

ipcMain.handle('recording:pause', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  const res = pauseRecordingChild()
  if (res.ok) updateTrayMenu()
  return res
})

ipcMain.handle('recording:resume', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  const res = resumeRecordingChild()
  if (res.ok) updateTrayMenu()
  return res
})

ipcMain.handle('recording:restart', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  // If not currently recording, just trigger the normal start sequence (with countdown) in the renderer.
  if (!recordingChild || recordingChild.killed) {
    void sendTrayStartRecordingToRenderer()
    return { ok: true }
  }
  restartPending = true
  const res = cancelRecordingChild()
  if (res.ok) updateTrayMenu()
  return res
})

ipcMain.handle(
  'system:openScreenRecordingSettings',
  async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (process.platform !== 'darwin') {
      return { ok: false, error: 'System Settings deep link is only supported on macOS.' }
    }
    const candidates = [
      // Ventura+ / Sonoma: ScreenCapture is under Privacy & Security.
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      // Older macOS: Security & Privacy (best-effort).
      'x-apple.systempreferences:com.apple.preference.security?Privacy',
    ]
    let lastErr: string | null = null
    for (const url of candidates) {
      try {
        // shell.openExternal resolves even if macOS ignores the deep link; treat that as success.
        await shell.openExternal(url)
        return { ok: true }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
    }
    return { ok: false, error: lastErr ?? 'Could not open System Settings.' }
  },
)

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
  destroyRecordingOverlay()
  destroyCameraOverlay()
  if (recordingChild && !recordingChild.killed) {
    recordingChild.kill('SIGINT')
  }
}

app.whenReady().then(() => {
  purgeLegacyRecentRecordingStore()
  if (process.platform === 'darwin') {
    const icon = appIconImage()
    if (!icon.isEmpty()) {
      app.dock?.setIcon(icon)
    }
  }
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
