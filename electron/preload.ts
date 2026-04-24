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

contextBridge.exposeInMainWorld('electronAPI', {
  resolveFfmpegPath: (): Promise<ResolveFfmpegResult> =>
    ipcRenderer.invoke('recording:resolveFfmpeg'),

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
})
