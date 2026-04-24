import { contextBridge, ipcRenderer } from 'electron'

export type ResolveFfmpegResult =
  | { path: string }
  | { path: null; error: string }

export type StartRecordingResult =
  | { ok: true; outputPath: string }
  | { ok: false; error: string }

export type StopRecordingResult = { ok: true } | { ok: false; error: string }

export type RevealInFinderResult = { ok: true } | { ok: false; error: string }

export type RecordingEndedPayload = { code: number | null; signal: NodeJS.Signals | null }

export type RecordingGcsUploadPayload =
  | { ok: true; url: string; outputPath: string }
  | { ok: false; error: string; outputPath: string }

export type AvfoundationDevice = { index: number; name: string }

export type ListAvfoundationDevicesResult =
  | { ok: true; video: AvfoundationDevice[]; audio: AvfoundationDevice[] }
  | { ok: false; error: string }

export type OpenCountdownOverlayResult = { ok: true } | { ok: false; error: string }

/** Full-screen countdown overlay window (see `overlay.html` / `src/overlay.tsx`). */
export type ElectronOverlayAPI = {
  open: (initial: number) => Promise<OpenCountdownOverlayResult>
  /** Called once from the overlay page so the main process can return the initial digit and show the window. */
  pullInitialCountdown: () => Promise<number | null>
  setValue: (value: number) => Promise<void>
  close: () => Promise<void>
  onCountdown: (callback: (value: number) => void) => () => void
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
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('window:minimize'),

  overlay,

  resolveFfmpegPath: (): Promise<ResolveFfmpegResult> =>
    ipcRenderer.invoke('recording:resolveFfmpeg'),

  listAvfoundationDevices: (): Promise<ListAvfoundationDevicesResult> =>
    ipcRenderer.invoke('recording:listAvfoundationDevices'),

  startRecording: (options?: {
    avfoundationInput?: string
  }): Promise<StartRecordingResult> =>
    ipcRenderer.invoke('recording:start', options ?? {}),

  stopRecording: (): Promise<StopRecordingResult> => ipcRenderer.invoke('recording:stop'),

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
})
