import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const appRoot = path.join(__dirname, '..')
process.env.APP_ROOT = appRoot

const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
const rendererDist = path.join(appRoot, 'dist')

let mainWindow: BrowserWindow | null = null

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

app.whenReady().then(createWindow)

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
