import { contextBridge, ipcRenderer } from 'electron'

export type ResolveSckRecorderResult =
  | { path: string }
  | { path: null; error: string }

export type StartRecordingResult =
  | { ok: true; outputPath: string }
  | { ok: false; error: string }

export type StopRecordingResult = { ok: true } | { ok: false; error: string }

export type RevealInFinderResult = { ok: true } | { ok: false; error: string }

export type RecordingEndedPayload = { code: number | null; signal: NodeJS.Signals | null }

export type RecordingGcsUploadPayload =
  | { ok: true; url: string; outputPath: string; localFileDeleted?: boolean }
  | { ok: false; error: string; outputPath: string }

export type CaptureDevice = { index: number; name: string }

export type ListCaptureDevicesResult =
  | { ok: true; video: CaptureDevice[]; audio: CaptureDevice[] }
  | { ok: false; error: string }

export type CaptureDisplayScreenshotResult =
  | { ok: true; pngBase64: string; width: number; height: number }
  | { ok: false; error: string }

export type OpenCountdownOverlayResult = { ok: true } | { ok: false; error: string }

export type ListRecentRecordingsResult = { urls: string[] }

export type OpenExternalUrlResult = { ok: true } | { ok: false; error: string }

/** Full-screen countdown overlay window (see `overlay.html` / `src/overlay.tsx`). */
export type ElectronOverlayAPI = {
  open: (initial: number) => Promise<OpenCountdownOverlayResult>
  /** Called once from the overlay page so the main process can return the initial digit and show the window. */
  pullInitialCountdown: () => Promise<number | null>
  setValue: (value: number) => Promise<void>
  close: () => Promise<void>
  onCountdown: (callback: (value: number) => void) => () => void
  /** User clicked “Skip”; main process ends `countdownWaitMs` early. */
  requestSkip: () => void
}

const overlay: ElectronOverlayAPI = {
  open: (initial: number) => ipcRenderer.invoke('overlay:open', initial),
  pullInitialCountdown: () => ipcRenderer.invoke('overlay:pull-initial'),
  setValue: (value: number) => ipcRenderer.invoke('overlay:set', value),
  close: () => ipcRenderer.invoke('overlay:close'),
  onCountdown: (callback: (value: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: number) => {
      callback(value)
    }
    ipcRenderer.on('overlay:value', handler)
    return () => {
      ipcRenderer.removeListener('overlay:value', handler)
    }
  },
  requestSkip: () => {
    ipcRenderer.send('overlay:skip-request')
  },
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('window:minimize'),

  /** Waits in the main process so delays stay accurate while the window is minimized. */
  countdownWaitMs: (ms: number): Promise<{ skipped: boolean }> =>
    ipcRenderer.invoke('countdown:wait-ms', ms),

  overlay,

  resolveSckRecorderPath: (): Promise<ResolveSckRecorderResult> =>
    ipcRenderer.invoke('recording:resolveSck'),

  listCaptureDevices: (): Promise<ListCaptureDevicesResult> =>
    ipcRenderer.invoke('recording:listCaptureDevices'),

  captureDisplayScreenshot: (displayIndex: number): Promise<CaptureDisplayScreenshotResult> =>
    ipcRenderer.invoke('recording:captureDisplayScreenshot', displayIndex),

  startRecording: (options?: { captureInput?: string }): Promise<StartRecordingResult> =>
    ipcRenderer.invoke('recording:start', options ?? {}),

  stopRecording: (): Promise<StopRecordingResult> => ipcRenderer.invoke('recording:stop'),

  listRecentRecordings: (): Promise<ListRecentRecordingsResult> =>
    ipcRenderer.invoke('recordings:listRecent'),

  openExternalUrl: (url: string): Promise<OpenExternalUrlResult> =>
    ipcRenderer.invoke('shell:openExternal', url),

  revealInFinder: (filePath: string): Promise<RevealInFinderResult> =>
    ipcRenderer.invoke('recording:revealInFinder', filePath),

  onRecordingStderr: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => {
      callback(chunk)
    }
    ipcRenderer.on('recording:stderr', handler)
    return () => {
      ipcRenderer.removeListener('recording:stderr', handler)
    }
  },

  onRecordingEnded: (callback: (payload: RecordingEndedPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RecordingEndedPayload) => {
      callback(payload)
    }
    ipcRenderer.on('recording:ended', handler)
    return () => {
      ipcRenderer.removeListener('recording:ended', handler)
    }
  },

  onRecordingGcsUpload: (callback: (payload: RecordingGcsUploadPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RecordingGcsUploadPayload) => {
      callback(payload)
    }
    ipcRenderer.on('recording:gcs-upload', handler)
    return () => {
      ipcRenderer.removeListener('recording:gcs-upload', handler)
    }
  },

  onTrayStartRecordingRequest: (callback: () => void): (() => void) => {
    const handler = () => {
      callback()
    }
    ipcRenderer.on('recording:tray-start-request', handler)
    return () => {
      ipcRenderer.removeListener('recording:tray-start-request', handler)
    }
  },
})
