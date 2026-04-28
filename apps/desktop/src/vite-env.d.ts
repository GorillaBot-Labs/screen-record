/// <reference types="vite/client" />

import type {
  CaptureDevice,
  CaptureDisplayScreenshotResult,
  ElectronOverlayAPI,
  ListCaptureDevicesResult,
  ListRecentRecordingsResult,
  OpenExternalUrlResult,
  OpenScreenRecordingSettingsResult,
  RecordingEndedPayload,
  RecordingGcsUploadPayload,
  RevealInFinderResult,
  ResolveSckRecorderResult,
  StartRecordingResult,
  StopRecordingResult,
} from "../electron/preload";

declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow: () => Promise<
        { ok: true } | { ok: false; error: string }
      >;
      countdownWaitMs: (ms: number) => Promise<{ skipped: boolean }>;
      overlay: ElectronOverlayAPI;
      resolveSckRecorderPath: () => Promise<ResolveSckRecorderResult>;
      listCaptureDevices: () => Promise<ListCaptureDevicesResult>;
      captureDisplayScreenshot: (
        displayIndex: number,
      ) => Promise<CaptureDisplayScreenshotResult>;
      startRecording: (options?: {
        captureInput?: string;
      }) => Promise<StartRecordingResult>;
      stopRecording: () => Promise<StopRecordingResult>;
      listRecentRecordings: () => Promise<ListRecentRecordingsResult>;
      openScreenRecordingSettings: () => Promise<OpenScreenRecordingSettingsResult>;
      openExternalUrl: (url: string) => Promise<OpenExternalUrlResult>;
      revealInFinder: (filePath: string) => Promise<RevealInFinderResult>;
      onRecordingStderr: (callback: (chunk: string) => void) => () => void;
      onRecordingEnded: (
        callback: (payload: RecordingEndedPayload) => void,
      ) => () => void;
      onRecordingGcsUpload: (
        callback: (payload: RecordingGcsUploadPayload) => void,
      ) => () => void;
      onTrayStartRecordingRequest: (callback: () => void) => () => void;
    };
  }
}

export {};
