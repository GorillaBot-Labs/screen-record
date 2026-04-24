/// <reference types="vite/client" />

import type {
  RecordingEndedPayload,
  ResolveFfmpegResult,
  StartRecordingResult,
  StopRecordingResult,
} from '../electron/preload'

declare global {
  interface Window {
    electronAPI?: {
      resolveFfmpegPath: () => Promise<ResolveFfmpegResult>
      startRecording: (options?: { avfoundationInput?: string }) => Promise<StartRecordingResult>
      stopRecording: () => Promise<StopRecordingResult>
      onRecordingStderr: (callback: (chunk: string) => void) => () => void
      onRecordingEnded: (callback: (payload: RecordingEndedPayload) => void) => () => void
    }
  }
}

export {}
