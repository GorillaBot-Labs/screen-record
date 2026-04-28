import { contextBridge, ipcRenderer } from 'electron'

export type ResolveSckRecorderResult =
  | { path: string }
  | { path: null; error: string }

export type StartRecordingResult =
  | { ok: true; outputPath: string; recordingStartedAtMs: number }
  | { ok: false; error: string }

export type StopRecordingResult = { ok: true } | { ok: false; error: string }
export type CancelRecordingResult = { ok: true } | { ok: false; error: string }
export type PauseRecordingResult = { ok: true } | { ok: false; error: string }
export type ResumeRecordingResult = { ok: true } | { ok: false; error: string }
export type RestartRecordingResult = { ok: true } | { ok: false; error: string }

export type RevealInFinderResult = { ok: true } | { ok: false; error: string }

export type RecordingEndedPayload = { code: number | null; signal: NodeJS.Signals | null; cancelled?: boolean }

export type RecordingGcsUploadPayload =
  | { ok: true; url: string; outputPath: string; localFileDeleted?: boolean }
  | { ok: false; error: string; outputPath: string }

export type CaptureDevice = { index: number; name: string; displayId?: number }

export type ListCaptureDevicesResult =
  | { ok: true; video: CaptureDevice[]; audio: CaptureDevice[] }
  | { ok: false; error: string }

export type CaptureDisplayScreenshotResult =
  | { ok: true; pngBase64: string; width: number; height: number }
  | { ok: false; error: string }

export type OpenCountdownOverlayResult = { ok: true } | { ok: false; error: string }

export type OpenRecordingOverlayResult = { ok: true } | { ok: false; error: string }

export type ListRecentRecordingsResult = { urls: string[] }

export type OpenExternalUrlResult = { ok: true } | { ok: false; error: string }

export type OpenScreenRecordingSettingsResult =
  | { ok: true }
  | { ok: false; error: string }

export type SystemInfo = {
  platform: string
  arch: string
  systemVersion: string | null
  isPackaged: boolean
  execPath: string
}

/** Full-screen countdown overlay window (see `overlay.html` / `src/overlay.tsx`). */
export type ElectronOverlayAPI = {
  open: (initial: number, displayIndex?: number | null) => Promise<OpenCountdownOverlayResult>
  /** Called once from the overlay page so the main process can return the initial digit and show the window. */
  pullInitialCountdown: () => Promise<number | null>
  setValue: (value: number) => Promise<void>
  close: () => Promise<void>
  onCountdown: (callback: (value: number) => void) => () => void
  /** User clicked “Skip”; main process ends `countdownWaitMs` early. */
  requestSkip: () => void
}

const overlay: ElectronOverlayAPI = {
  open: (initial: number, displayIndex?: number | null) =>
    ipcRenderer.invoke('overlay:open', initial, displayIndex ?? null),
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

export type ElectronRecordingOverlayAPI = {
  open: (startedAtMs: number, displayIndex?: number | null) => Promise<OpenRecordingOverlayResult>
  pullInitial: () => Promise<number | null>
  close: () => Promise<void>
  stop: () => Promise<StopRecordingResult>
  cancel: () => Promise<CancelRecordingResult>
  pause: () => Promise<PauseRecordingResult>
  resume: () => Promise<ResumeRecordingResult>
  restart: () => Promise<RestartRecordingResult>
}

const recordingOverlay: ElectronRecordingOverlayAPI = {
  open: (startedAtMs: number, displayIndex?: number | null) =>
    ipcRenderer.invoke('recordingOverlay:open', startedAtMs, displayIndex ?? null),
  pullInitial: () => ipcRenderer.invoke('recordingOverlay:pull-initial'),
  close: () => ipcRenderer.invoke('recordingOverlay:close'),
  stop: () => ipcRenderer.invoke('recording:stop'),
  cancel: () => ipcRenderer.invoke('recording:cancel'),
  pause: () => ipcRenderer.invoke('recording:pause'),
  resume: () => ipcRenderer.invoke('recording:resume'),
  restart: () => ipcRenderer.invoke('recording:restart'),
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('window:minimize'),

  /** Waits in the main process so delays stay accurate while the window is minimized. */
  countdownWaitMs: (ms: number): Promise<{ skipped: boolean }> =>
    ipcRenderer.invoke('countdown:wait-ms', ms),

  overlay,
  recordingOverlay,

  resolveSckRecorderPath: (): Promise<ResolveSckRecorderResult> =>
    ipcRenderer.invoke('recording:resolveSck'),

  listCaptureDevices: (): Promise<ListCaptureDevicesResult> =>
    ipcRenderer.invoke('recording:listCaptureDevices'),

  captureDisplayScreenshot: async (displayIdOrIndex: number): Promise<CaptureDisplayScreenshotResult> => {
    try {
      // Standardized preview pipeline: always generate screenshots via the native helper (`sck-record`)
      // through the main process IPC so previews and recording use the same capture stack.
      return ipcRenderer.invoke('recording:captureDisplayScreenshot', displayIdOrIndex)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  },

  startRecording: (options?: { captureInput?: string }): Promise<StartRecordingResult> =>
    ipcRenderer.invoke('recording:start', options ?? {}),

  stopRecording: (): Promise<StopRecordingResult> => ipcRenderer.invoke('recording:stop'),
  cancelRecording: (): Promise<CancelRecordingResult> => ipcRenderer.invoke('recording:cancel'),

  listRecentRecordings: (): Promise<ListRecentRecordingsResult> =>
    ipcRenderer.invoke('recordings:listRecent'),

  openScreenRecordingSettings: (): Promise<OpenScreenRecordingSettingsResult> =>
    ipcRenderer.invoke('system:openScreenRecordingSettings'),

  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('system:getInfo'),

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
