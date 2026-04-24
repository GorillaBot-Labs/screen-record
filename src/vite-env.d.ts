/// <reference types="vite/client" />

import type {
  ListAvfoundationDevicesResult,
  RecordingEndedPayload,
  RevealInFinderResult,
  ResolveFfmpegResult,
  StartRecordingResult,
  StopRecordingResult,
} from '../electron/preload'

declare global {
  interface Window {
    electronAPI?: {
      resolveFfmpegPath: () => Promise<ResolveFfmpegResult>
      listAvfoundationDevices: () => Promise<ListAvfoundationDevicesResult>
      startRecording: (options?: { avfoundationInput?: string }) => Promise<StartRecordingResult>
      stopRecording: () => Promise<StopRecordingResult>
      revealInFinder: (filePath: string) => Promise<RevealInFinderResult>
      onRecordingStderr: (callback: (chunk: string) => void) => () => void
      onRecordingEnded: (callback: (payload: RecordingEndedPayload) => void) => () => void
    }
  }
}

export {}
