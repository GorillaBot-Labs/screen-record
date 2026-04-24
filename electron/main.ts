import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import { destroyCountdownOverlay, registerCountdownOverlayIpc } from './countdown-overlay'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const appRoot = path.join(__dirname, '..')
process.env.APP_ROOT = appRoot

const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
const rendererDist = path.join(appRoot, 'dist')

registerCountdownOverlayIpc({
  preloadPath: path.join(__dirname, 'preload.mjs'),
  rendererDist,
  viteDevServerUrl,
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/** Default AVFoundation input string `<video>:<audio>` (see plan). */
const DEFAULT_AVFOUNDATION_INPUT = '3:1'

let ffmpegChild: ChildProcess | null = null

function resolveFfmpegPath(): string | null {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    const out = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim()
    if (out.length > 0) return out
  } catch {
    /* not on PATH */
  }
  return null
}

function recordingsDir(): string {
  return path.join(app.getPath('home'), 'Movies', 'recordings')
}

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return path.join(recordingsDir(), `recording_${stamp}.mp4`)
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

function updateTrayMenu() {
  if (!tray) return
  const recording = Boolean(ffmpegChild && !ffmpegChild.killed)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Screen Record',
        click: () => {
          showMainWindow()
        },
      },
      { type: 'separator' },
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
    ]),
  )
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

/** Sends SIGINT to ffmpeg; used from IPC and the menu bar tray. */
function stopRecordingChild(): { ok: true } | { ok: false; error: string } {
  const child = ffmpegChild
  if (!child || child.killed) {
    return { ok: false, error: 'Not recording.' }
  }
  child.kill('SIGINT')
  return { ok: true }
}

type AvfoundationDevice = { index: number; name: string }

function parseAvfoundationDeviceList(stderr: string): { video: AvfoundationDevice[]; audio: AvfoundationDevice[] } {
  const video: AvfoundationDevice[] = []
  const audio: AvfoundationDevice[] = []
  let section: 'none' | 'video' | 'audio' = 'none'
  for (const line of stderr.split(/\r?\n/)) {
    if (line.includes('AVFoundation video devices:')) {
      section = 'video'
      video.length = 0
      continue
    }
    if (line.includes('AVFoundation audio devices:')) {
      section = 'audio'
      audio.length = 0
      continue
    }
    const m = line.match(/\]\s*\[(\d+)\]\s*(.+)$/)
    if (!m) continue
    const index = Number.parseInt(m[1], 10)
    const name = m[2].trim()
    if (Number.isNaN(index) || name.length === 0) continue
    if (section === 'video') video.push({ index, name })
    else if (section === 'audio') audio.push({ index, name })
  }
  return { video, audio }
}

function listAvfoundationDevicesFromFfmpeg(ffmpegPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    const t = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Listing devices timed out.'))
    }, 20_000)
    child.stderr.on('data', (c: Buffer) => {
      chunks.push(c)
    })
    child.on('error', (err) => {
      clearTimeout(t)
      reject(err)
    })
    child.on('close', () => {
      clearTimeout(t)
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

ipcMain.handle('recording:resolveFfmpeg', (): { path: string } | { path: null; error: string } => {
  const resolved = resolveFfmpegPath()
  if (resolved) return { path: resolved }
  return { path: null, error: 'ffmpeg not found. Install with brew install ffmpeg or add ffmpeg to PATH.' }
})

ipcMain.handle(
  'recording:listAvfoundationDevices',
  async (): Promise<
    | { ok: true; video: AvfoundationDevice[]; audio: AvfoundationDevice[] }
    | { ok: false; error: string }
  > => {
    if (process.platform !== 'darwin') {
      return { ok: false, error: 'AVFoundation device listing is only available on macOS.' }
    }
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) {
      return {
        ok: false,
        error: 'ffmpeg not found. Install with brew install ffmpeg or add ffmpeg to PATH.',
      }
    }
    try {
      const stderr = await listAvfoundationDevicesFromFfmpeg(ffmpegPath)
      const { video, audio } = parseAvfoundationDeviceList(stderr)
      if (video.length === 0 && audio.length === 0) {
        return {
          ok: false,
          error:
            'No AVFoundation devices parsed from ffmpeg output. Try running: ffmpeg -f avfoundation -list_devices true -i ""',
        }
      }
      return { ok: true, video, audio }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle(
  'recording:start',
  async (
    event,
    options: { avfoundationInput?: string } = {},
  ): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> => {
    if (ffmpegChild) {
      return { ok: false, error: 'Recording already in progress.' }
    }

    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) {
      return {
        ok: false,
        error: 'ffmpeg not found. Try /opt/homebrew/bin/ffmpeg, /usr/local/bin/ffmpeg, or PATH.',
      }
    }

    const avInput = options.avfoundationInput?.trim() || DEFAULT_AVFOUNDATION_INPUT
    const outputPath = defaultOutputPath()

    try {
      mkdirSync(recordingsDir(), { recursive: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: `Could not create output directory: ${msg}` }
    }

    const args = [
      '-y',
      '-f',
      'avfoundation',
      '-framerate',
      '30',
      '-i',
      avInput,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath,
    ]

    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    ffmpegChild = child

    const sender = event.sender
    child.stderr.on('data', (chunk: Buffer) => {
      forwardStderrToRenderer(sender, chunk)
    })

    child.on('error', (err) => {
      if (ffmpegChild === child) {
        ffmpegChild = null
      }
      forwardStderrToRenderer(sender, `ffmpeg process error: ${err.message}\n`)
      updateTrayMenu()
    })

    child.on('close', (code, signal) => {
      if (ffmpegChild === child) {
        ffmpegChild = null
      }
      if (existsSync(outputPath)) {
        shell.showItemInFolder(outputPath)
      }
      forwardRecordingEnded(sender, { code, signal })
      updateTrayMenu()
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

function isPathInsideRecordingsDir(filePath: string): boolean {
  const abs = path.resolve(filePath)
  const root = path.resolve(recordingsDir())
  return abs === root || abs.startsWith(root + path.sep)
}

ipcMain.handle(
  'recording:revealInFinder',
  async (_event, filePath: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      return { ok: false, error: 'Invalid path.' }
    }
    const abs = path.resolve(filePath.trim())
    if (!isPathInsideRecordingsDir(abs)) {
      return { ok: false, error: 'Path must be inside your Movies/recordings folder.' }
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
  if (ffmpegChild && !ffmpegChild.killed) {
    ffmpegChild.kill('SIGINT')
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
