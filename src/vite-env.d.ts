/// <reference types="vite/client" />

import type {
  ElectronOverlayAPI,
  ListAvfoundationDevicesResult,
  RecordingEndedPayload,
  RecordingGcsUploadPayload,
  RevealInFinderResult,
  ResolveFfmpegResult,
  StartRecordingResult,
  StopRecordingResult,
} from '../electron/preload'

declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow: () => Promise<{ ok: true } | { ok: false; error: string }>
      overlay: ElectronOverlayAPI
      resolveFfmpegPath: () => Promise<ResolveFfmpegResult>
      listAvfoundationDevices: () => Promise<ListAvfoundationDevicesResult>
      startRecording: (options?: { avfoundationInput?: string }) => Promise<StartRecordingResult>
      stopRecording: () => Promise<StopRecordingResult>
      revealInFinder: (filePath: string) => Promise<RevealInFinderResult>
      onRecordingStderr: (callback: (chunk: string) => void) => () => void
      onRecordingEnded: (callback: (payload: RecordingEndedPayload) => void) => () => void
      onRecordingGcsUpload: (callback: (payload: RecordingGcsUploadPayload) => void) => () => void
    }
  }
}

export {}
