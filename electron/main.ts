import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, ipcMain } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const appRoot = path.join(__dirname, '..')
process.env.APP_ROOT = appRoot

const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
const rendererDist = path.join(appRoot, 'dist')

let mainWindow: BrowserWindow | null = null

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

  if (viteDevServerUrl) {
    mainWindow.loadURL(viteDevServerUrl)
  } else {
    mainWindow.loadFile(path.join(rendererDist, 'index.html'))
  }
}

function forwardStderrToRenderer(sender: Electron.WebContents, chunk: Buffer | string) {
  sender.send('recording:stderr', typeof chunk === 'string' ? chunk : chunk.toString())
}

ipcMain.handle('recording:resolveFfmpeg', (): { path: string } | { path: null; error: string } => {
  const resolved = resolveFfmpegPath()
  if (resolved) return { path: resolved }
  return { path: null, error: 'ffmpeg not found. Install with brew install ffmpeg or add ffmpeg to PATH.' }
})

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
    })

    child.on('close', (code, signal) => {
      if (ffmpegChild === child) {
        ffmpegChild = null
      }
      sender.send('recording:ended', { code, signal })
    })

    return { ok: true, outputPath }
  })

ipcMain.handle('recording:stop', async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  const child = ffmpegChild
  if (!child || child.killed) {
    return { ok: false, error: 'Not recording.' }
  }

  child.kill('SIGINT')
  return { ok: true }
})

function stopRecordingOnQuit() {
  if (ffmpegChild && !ffmpegChild.killed) {
    ffmpegChild.kill('SIGINT')
  }
}

app.whenReady().then(() => {
  createWindow()
})

app.on('before-quit', stopRecordingOnQuit)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
