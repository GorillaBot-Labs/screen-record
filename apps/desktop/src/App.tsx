import { LogoMark } from "@/components/LogoMark";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Mic,
  Monitor,
  RefreshCw,
  Video,
} from "lucide-react";

import type { CaptureDevice } from "../electron/preload";

const VIDEO_INDEX_STORAGE_KEY = "screen-record:avVideoIndex";
const AUDIO_INDEX_STORAGE_KEY = "screen-record:avAudioIndex";
const CAMERA_INDEX_STORAGE_KEY = "screen-record:cameraIndex";
const CAMERA_ENABLED_STORAGE_KEY = "screen-record:cameraEnabled";
/** Legacy single-field storage; migrated once into index keys when present. */
const LEGACY_AV_INPUT_KEY = "screen-record:avfoundationInput";

type DiagnosticsEvent = {
  at: number;
  kind: string;
  message?: string;
  data?: unknown;
};

function formatDiagnosticsEvent(e: DiagnosticsEvent): string {
  const iso = new Date(e.at).toISOString();
  const msg = e.message ? ` ${e.message}` : "";
  if (e.data === undefined) return `${iso} ${e.kind}${msg}`;
  try {
    return `${iso} ${e.kind}${msg} ${JSON.stringify(e.data)}`;
  } catch {
    return `${iso} ${e.kind}${msg} [unserializable data]`;
  }
}

function loadStoredIndex(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw.trim().length === 0) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function persistIndex(key: string, index: number) {
  try {
    localStorage.setItem(key, String(index));
  } catch {
    /* ignore */
  }
}

function readLegacyAvPair(): { v: number; a: number } | null {
  try {
    const s = localStorage.getItem(LEGACY_AV_INPUT_KEY)?.trim();
    if (!s) return null;
    const m = /^(\d+):(\d+)$/.exec(s);
    if (!m) return null;
    const v = Number.parseInt(m[1], 10);
    const a = Number.parseInt(m[2], 10);
    if (!Number.isFinite(v) || !Number.isFinite(a)) return null;
    return { v, a };
  } catch {
    return null;
  }
}

function pickDefaultVideo(devices: CaptureDevice[]): number | null {
  if (devices.length === 0) return null;
  if (devices.some((d) => d.index === 0)) return 0;
  const screen = devices.find((d) => /display|screen/i.test(d.name));
  return screen?.index ?? devices[0]!.index;
}

function pickDefaultAudio(devices: CaptureDevice[]): number | null {
  if (devices.length === 0) return null;
  if (devices.some((d) => d.index === 0)) return 0;
  return devices[0]!.index;
}

function pickDefaultCamera(devices: CaptureDevice[]): number | null {
  if (devices.length === 0) return null;
  if (devices.some((d) => d.index === 0)) return 0;
  return devices[0]!.index;
}

function loadCameraEnabled(): boolean {
  try {
    const raw = localStorage.getItem(CAMERA_ENABLED_STORAGE_KEY);
    if (raw == null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

function persistCameraEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CAMERA_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function captureInputForDevices(
  videoIndex: number,
  audioIndex: number,
  cameraEnabled: boolean,
  cameraIndex: number | null,
  cameraDevices: CaptureDevice[],
): string {
  const cameraPart =
    cameraEnabled && cameraIndex != null && cameraDevices.length > 0
      ? String(cameraIndex)
      : "-1";
  return `${videoIndex}:${audioIndex}:${cameraPart}`;
}

function sortByIndex(devices: CaptureDevice[]): CaptureDevice[] {
  return [...devices].sort((a, b) => a.index - b.index);
}

export default function App() {
  const [log, setLog] = useState<string>("");
  const [status, setStatus] = useState<string>("Idle");
  const [videoDevices, setVideoDevices] = useState<CaptureDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<CaptureDevice[]>([]);
  const [cameraDevices, setCameraDevices] = useState<CaptureDevice[]>([]);
  const [videoIndex, setVideoIndex] = useState<number | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(loadCameraEnabled);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  /** After sck-record exits: upload to GCS until we get `recording:gcs-upload`. */
  const [cloudUploading, setCloudUploading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [diagnosticsEvents, setDiagnosticsEvents] = useState<DiagnosticsEvent[]>(
    [],
  );
  /** 3 → 2 → 1 fullscreen overlay before recording; `null` when hidden. */
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Blocks overlapping start/countdown; avoids depending on `countdown` in `handleStart` deps (tray listener stability). */
  const startRecordingSequenceRef = useRef(false);
  const logRef = useRef<string>("");
  const diagnosticsRef = useRef<DiagnosticsEvent[]>([]);
  const outputPathRef = useRef<string | null>(null);
  outputPathRef.current = outputPath;

  const pushDiagnosticsEvent = useCallback(
    (event: Omit<DiagnosticsEvent, "at">) => {
      const next: DiagnosticsEvent = { at: Date.now(), ...event };
      diagnosticsRef.current = [...diagnosticsRef.current, next].slice(-50);
      setDiagnosticsEvents(diagnosticsRef.current);
    },
    [],
  );

  const applyDeviceSelection = useCallback(
    (video: CaptureDevice[], audio: CaptureDevice[], cameras: CaptureDevice[]) => {
      const legacy = readLegacyAvPair();
      let v = loadStoredIndex(VIDEO_INDEX_STORAGE_KEY) ?? legacy?.v ?? null;
      let a = loadStoredIndex(AUDIO_INDEX_STORAGE_KEY) ?? legacy?.a ?? null;
      let c = loadStoredIndex(CAMERA_INDEX_STORAGE_KEY) ?? null;
      if (v == null || !video.some((d) => d.index === v))
        v = pickDefaultVideo(video);
      if (a == null || !audio.some((d) => d.index === a))
        a = pickDefaultAudio(audio);
      if (c == null || !cameras.some((d) => d.index === c))
        c = pickDefaultCamera(cameras);
      setVideoIndex(v);
      setAudioIndex(a);
      setCameraIndex(c);
      if (v != null) persistIndex(VIDEO_INDEX_STORAGE_KEY, v);
      if (a != null) persistIndex(AUDIO_INDEX_STORAGE_KEY, a);
      if (c != null) persistIndex(CAMERA_INDEX_STORAGE_KEY, c);
    },
    [],
  );

  const refreshDevices = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    const t0 = performance.now();
    pushDiagnosticsEvent({ kind: "devices.refresh.start" });
    setDevicesLoading(true);
    setDevicesError(null);
    const res = await api.listCaptureDevices();
    setDevicesLoading(false);
    if (!res.ok) {
      pushDiagnosticsEvent({
        kind: "devices.refresh.error",
        message: res.error,
        data: { ms: Math.round(performance.now() - t0) },
      });
      setDevicesError(res.error);
      setVideoDevices([]);
      setAudioDevices([]);
      setCameraDevices([]);
      setVideoIndex(null);
      setAudioIndex(null);
      setCameraIndex(null);
      return;
    }
    const video = sortByIndex(res.video);
    const audio = sortByIndex(res.audio);
    const cameras = sortByIndex(res.cameras ?? []);
    pushDiagnosticsEvent({
      kind: "devices.refresh.ok",
      data: {
        ms: Math.round(performance.now() - t0),
        videoCount: video.length,
        audioCount: audio.length,
        cameraCount: cameras.length,
      },
    });
    setVideoDevices(video);
    setAudioDevices(audio);
    setCameraDevices(cameras);
    applyDeviceSelection(video, audio, cameras);
  }, [applyDeviceSelection, pushDiagnosticsEvent]);

  // Intentionally disabled: screenshot-based preview + readiness preflight.
  // Some environments require Screen Recording permission to be granted to the exact
  // Electron binary; probing for screenshots can be slow and confusing. We instead
  // allow recording attempts and surface errors from the recorder process.

  useEffect(() => {
    const api = window.electronAPI;
    pushDiagnosticsEvent({
      kind: "renderer.mounted",
      data: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    if (!api) {
      return;
    }

    void refreshDevices();

    const offStderr = api.onRecordingStderr((chunk) => {
      logRef.current += chunk;
      setLog(logRef.current);
    });

    const offEnded = api.onRecordingEnded(({ code, signal, cancelled }) => {
      pushDiagnosticsEvent({
        kind: "recording.ended",
        data: { code, signal, cancelled: Boolean(cancelled), outputPath: outputPathRef.current },
      });
      setRecording(false);
      if (cancelled) {
        setCloudUploading(false);
        setShareError(null);
        setOutputPath(null);
        setStatus("Cancelled.");
        return;
      }
      setCloudUploading(true);
      setShareError(null);
      setStatus("Uploading…");
    });

    const offGcs = api.onRecordingGcsUpload((p) => {
      pushDiagnosticsEvent({
        kind: p.ok ? "upload.ok" : "upload.error",
        message: p.ok ? undefined : p.error,
        data: p.ok
          ? {
              url: p.url,
              gcsUrl: p.gcsUrl,
              gcsObjectName: p.gcsObjectName,
              detailUrl: p.detailUrl,
              outputPath: p.outputPath,
              localFileDeleted: p.localFileDeleted,
            }
          : { outputPath: p.outputPath },
      });
      setCloudUploading(false);
      if (p.outputPath !== outputPathRef.current) return;
      if (p.ok) {
        const appLink = p.detailUrl ?? p.url ?? null;
        setShareError(
          appLink
            ? null
            : p.ingestError ??
                "Uploaded, but could not open the recording page. Check ~/.screen-record/.env and that the web app is running.",
        );
        setStatus(
          appLink
            ? "Recording ready — opened in your browser."
            : "Recording uploaded, but the browser did not open.",
        );
        if (appLink) {
          setToast("Opened in browser");
        }
        if (p.localFileDeleted) {
          setOutputPath(null);
        }
      } else {
        setShareError(p.error);
        setStatus("Upload failed.");
      }
    });

    return () => {
      offStderr();
      offEnded();
      offGcs();
    };
  }, [pushDiagnosticsEvent, refreshDevices]);

  useEffect(() => {
    if (toast == null) return;
    const id = window.setTimeout(() => {
      setToast(null);
    }, 1600);
    return () => {
      window.clearTimeout(id);
    };
  }, [toast]);

  // Preview + readiness checks are disabled (see note above).

  function resolutionFromDeviceName(name: string): string | null {
    const m = /(\d{3,5})\s*[x×]\s*(\d{3,5})/.exec(name);
    if (!m) return null;
    const w = Number.parseInt(m[1], 10);
    const h = Number.parseInt(m[2], 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return `${w}×${h}`;
  }

  function handleVideoChange(index: number) {
    pushDiagnosticsEvent({ kind: "devices.video.select", data: { index } });
    setVideoIndex(index);
    persistIndex(VIDEO_INDEX_STORAGE_KEY, index);
  }

  function handleAudioChange(index: number) {
    pushDiagnosticsEvent({ kind: "devices.audio.select", data: { index } });
    setAudioIndex(index);
    persistIndex(AUDIO_INDEX_STORAGE_KEY, index);
  }

  function handleCameraChange(index: number) {
    pushDiagnosticsEvent({ kind: "devices.camera.select", data: { index } });
    setCameraIndex(index);
    persistIndex(CAMERA_INDEX_STORAGE_KEY, index);
  }

  function handleCameraEnabledChange(enabled: boolean) {
    pushDiagnosticsEvent({ kind: "devices.camera.enabled", data: { enabled } });
    setCameraEnabled(enabled);
    persistCameraEnabled(enabled);
  }

  const handleStart = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    if (recording) {
      setStatus("Already recording.");
      pushDiagnosticsEvent({ kind: "recording.start.noop", message: "Already recording" });
      return;
    }
    if (startRecordingSequenceRef.current) {
      setStatus("Countdown already in progress.");
      pushDiagnosticsEvent({
        kind: "recording.start.noop",
        message: "Countdown already in progress",
      });
      return;
    }
    if (devicesLoading) {
      setStatus("Still loading devices; try again in a moment.");
      pushDiagnosticsEvent({
        kind: "recording.start.blocked",
        message: "Devices still loading",
      });
      return;
    }
    if (devicesError != null) {
      setStatus(`Cannot start: ${devicesError}`);
      pushDiagnosticsEvent({
        kind: "recording.start.blocked",
        message: devicesError,
      });
      return;
    }
    if (videoDevices.length === 0 || audioDevices.length === 0) {
      setStatus("No capture devices available.");
      pushDiagnosticsEvent({
        kind: "recording.start.blocked",
        message: "No capture devices available",
        data: { videoCount: videoDevices.length, audioCount: audioDevices.length },
      });
      return;
    }
    if (videoIndex == null || audioIndex == null) {
      setStatus("Choose video and audio devices in the app first.");
      pushDiagnosticsEvent({
        kind: "recording.start.blocked",
        message: "Missing device selection",
        data: { videoIndex, audioIndex },
      });
      return;
    }
    startRecordingSequenceRef.current = true;
    let minRes: { ok: true } | { ok: false; error: string } = { ok: true };
    try {
      pushDiagnosticsEvent({
        kind: "recording.start.sequence.begin",
        data: { videoIndex, audioIndex, cameraIndex, cameraEnabled },
      });
      setCountdown(3);
      const overlayRes = await api.overlay.open(3, videoIndex);
      if (!overlayRes.ok) {
        setCountdown(null);
        setStatus(`Could not open countdown overlay: ${overlayRes.error}`);
        pushDiagnosticsEvent({
          kind: "recording.start.sequence.error",
          message: overlayRes.error,
          data: { step: "overlay.open" },
        });
        return;
      }

      minRes = await api.minimizeWindow();
      if (!minRes.ok) {
        setStatus(`Could not minimize window: ${minRes.error}`);
        pushDiagnosticsEvent({
          kind: "window.minimize.error",
          message: minRes.error,
        });
      }

      let shown = 3;
      while (shown > 0) {
        const { skipped } = await api.countdownWaitMs(1000);
        if (skipped) break;
        shown -= 1;
        if (shown > 0) {
          setCountdown(shown);
          await api.overlay.setValue(shown);
        }
      }

      await api.overlay.close();
      setCountdown(null);

      logRef.current = "";
      setLog("");
      setStatus("Starting…");
      const input = captureInputForDevices(
        videoIndex,
        audioIndex,
        cameraEnabled,
        cameraIndex,
        cameraDevices,
      );
      const t0 = performance.now();
      const res = await api.startRecording({ captureInput: input });
      if (res.ok) {
        pushDiagnosticsEvent({
          kind: "recording.start.ok",
          data: {
            ms: Math.round(performance.now() - t0),
            outputPath: res.outputPath,
            recordingStartedAtMs: res.recordingStartedAtMs,
            captureInput: input,
          },
        });
        setRecording(true);
        setOutputPath(res.outputPath);
        setShareError(null);
        setCloudUploading(false);
        setStatus(
          minRes.ok ? "Recording" : "Recording (window was not minimized)",
        );
      } else {
        pushDiagnosticsEvent({
          kind: "recording.start.error",
          message: res.error,
          data: { ms: Math.round(performance.now() - t0), captureInput: input },
        });
        setStatus(`Start failed: ${res.error}`);
      }
    } finally {
      startRecordingSequenceRef.current = false;
    }
  }, [
    audioDevices.length,
    audioIndex,
    cameraDevices,
    cameraEnabled,
    cameraIndex,
    devicesError,
    devicesLoading,
    recording,
    videoDevices.length,
    videoIndex,
    pushDiagnosticsEvent,
  ]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onTrayStartRecordingRequest) return;
    const off = api.onTrayStartRecordingRequest(() => {
      void handleStart();
    });
    return () => {
      off();
    };
  }, [handleStart]);

  function showToast(message: string) {
    setToast(message);
  }

  async function handleCopyDiagnostics() {
    type ElectronAPIWithSystemInfo = NonNullable<typeof window.electronAPI> & {
      getSystemInfo?: () => Promise<{
        platform: string;
        arch: string;
        systemVersion: string | null;
        isPackaged: boolean;
        execPath: string;
      }>;
    };
    const api = window.electronAPI as ElectronAPIWithSystemInfo | undefined;
    const systemInfo = api?.getSystemInfo ? await api.getSystemInfo() : null;
    const header = [
      "Screen Record — diagnostics",
      `capturedAt=${new Date().toISOString()}`,
      `hasBridge=${String(Boolean(window.electronAPI))}`,
      `systemVersion=${systemInfo?.systemVersion ?? ""}`,
      `execPath=${systemInfo?.execPath ?? ""}`,
      `isPackaged=${systemInfo ? String(systemInfo.isPackaged) : ""}`,
      `arch=${systemInfo?.arch ?? ""}`,
      `userAgent=${navigator.userAgent}`,
      `platform=${navigator.platform}`,
      `language=${navigator.language}`,
      `timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `recording=${String(recording)}`,
      `cloudUploading=${String(cloudUploading)}`,
      `devicesLoading=${String(devicesLoading)}`,
      `devicesError=${devicesError ?? ""}`,
      `videoDevices=${videoDevices.length}`,
      `audioDevices=${audioDevices.length}`,
      `videoIndex=${videoIndex ?? ""}`,
      `audioIndex=${audioIndex ?? ""}`,
      `cameraEnabled=${String(cameraEnabled)}`,
      `cameraDevices=${cameraDevices.length}`,
      `cameraIndex=${cameraIndex ?? ""}`,
      `shareError=${shareError ?? ""}`,
      `outputPath=${outputPath ?? ""}`,
      "",
      "events:",
    ].join("\n");
    const body =
      diagnosticsEvents.length === 0
        ? "—"
        : diagnosticsEvents.map(formatDiagnosticsEvent).join("\n");
    const text = `${header}\n${body}\n`;
    try {
      await navigator.clipboard.writeText(text);
      pushDiagnosticsEvent({ kind: "clipboard.copy.diagnostics.ok" });
      showToast("Diagnostics copied");
    } catch {
      pushDiagnosticsEvent({ kind: "clipboard.copy.diagnostics.error" });
      setStatus("Could not copy diagnostics automatically.");
    }
  }

  const hasBridge = Boolean(window.electronAPI);
  const canRecord =
    hasBridge &&
    !recording &&
    countdown === null &&
    !devicesLoading &&
    devicesError == null &&
    videoIndex != null &&
    audioIndex != null &&
    videoDevices.length > 0 &&
    audioDevices.length > 0;

  const uiLockedForCountdown = countdown !== null;

  type StudioPhase =
    | "countdown"
    | "recording"
    | "uploading"
    | "ready"
    | "error"
    | "idle";

  let studioPhase: StudioPhase = "idle";
  if (countdown !== null) studioPhase = "countdown";
  else if (recording) studioPhase = "recording";
  else if (cloudUploading) studioPhase = "uploading";
  else if (shareError || devicesError) studioPhase = "error";
  else if (status.toLowerCase().includes("opened")) studioPhase = "ready";

  const heroLabel =
    countdown !== null
      ? `Starting in ${countdown}…`
      : recording
        ? "Recording — stop from the menu bar or tray"
        : cloudUploading
          ? "Uploading your recording…"
          : shareError
            ? shareError
            : devicesError
              ? devicesError
              : studioPhase === "ready"
                ? "Your recording is open in the browser"
                : "Tap record when you're ready";

  const statusLabel =
    countdown !== null
      ? "Starting"
      : recording
        ? "Recording"
        : cloudUploading
          ? "Uploading"
          : shareError || devicesError
            ? "Needs attention"
            : studioPhase === "ready"
              ? "Done"
              : devicesLoading
                ? "Loading"
                : "Ready";

  const statusClass = `studio-status studio-status--${studioPhase === "idle" && devicesLoading ? "busy" : studioPhase}`;

  const setupLocked =
    !hasBridge || recording || uiLockedForCountdown || devicesLoading;

  return (
    <>
      <div className="studio">
        <header className="studio-bar">
          <div className="studio-brand">
            <LogoMark className="studio-mark" size={36} />
            <div className="studio-brand-copy">
              <h1 className="studio-title">Screen Record</h1>
              <p className={statusClass} role="status" aria-live="polite">
                {statusLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="studio-icon-btn"
            onClick={() => void refreshDevices()}
            disabled={!hasBridge || recording || devicesLoading || uiLockedForCountdown}
            aria-label="Refresh devices"
            title="Refresh devices"
          >
            <RefreshCw size={18} aria-hidden className={devicesLoading ? "studio-spin" : undefined} />
          </button>
        </header>

        {!hasBridge ? (
          <p className="studio-banner" role="status">
            Open in Electron to record — the browser preview has no system bridge.
          </p>
        ) : null}

        <main className="studio-main">
          <section
            className={`studio-hero studio-hero--${studioPhase}`}
            aria-labelledby="studio-hero-label"
          >
            <button
              type="button"
              className="studio-record"
              onClick={() => void handleStart()}
              disabled={!canRecord}
              aria-label={recording ? "Recording in progress" : "Start recording"}
            >
              <span className="studio-record-ring" aria-hidden />
              <span className="studio-record-core" aria-hidden />
            </button>
            <p id="studio-hero-label" className="studio-hero-label">
              {heroLabel}
            </p>
            {status !== "Idle" && status !== heroLabel ? (
              <p className="studio-hero-detail" aria-live="polite">
                {status}
              </p>
            ) : null}
          </section>

          <section className="studio-setup" aria-label="Capture setup">
            {devicesLoading ? (
              <p className="studio-setup-note">Loading devices…</p>
            ) : null}

            {!devicesLoading && !devicesError ? (
              <>
                <div className="studio-field">
                  <span className="studio-field-label" id="screen-picker-label">
                    Screen
                  </span>
                  <div
                    className="studio-screens"
                    role="radiogroup"
                    aria-labelledby="screen-picker-label"
                  >
                    {videoDevices.map((d) => {
                      const selected = d.index === videoIndex;
                      const resolution = resolutionFromDeviceName(d.name);
                      return (
                        <button
                          key={d.index}
                          type="button"
                          className={
                            selected
                              ? "studio-screen studio-screen--selected"
                              : "studio-screen"
                          }
                          onClick={() => handleVideoChange(d.index)}
                          disabled={setupLocked || videoDevices.length === 0}
                          role="radio"
                          aria-checked={selected}
                        >
                          <Monitor size={16} strokeWidth={2} aria-hidden />
                          <span className="studio-screen-copy">
                            <span className="studio-screen-name">{d.name}</span>
                            {resolution ? (
                              <span className="studio-screen-meta">{resolution}</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="studio-field">
                  <label htmlFor="av-audio" className="studio-field-label">
                    <Mic size={14} strokeWidth={2} aria-hidden />
                    Microphone
                  </label>
                  <select
                    id="av-audio"
                    className="studio-select"
                    value={audioIndex ?? ""}
                    onChange={(e) =>
                      handleAudioChange(Number.parseInt(e.target.value, 10))
                    }
                    disabled={setupLocked || audioDevices.length === 0}
                  >
                    {audioDevices.map((d) => (
                      <option key={d.index} value={d.index}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="studio-field">
                  <div className="studio-field-head">
                    <label htmlFor="av-camera" className="studio-field-label">
                      <Video size={14} strokeWidth={2} aria-hidden />
                      Camera
                    </label>
                    <label className="studio-toggle">
                      <input
                        type="checkbox"
                        checked={cameraEnabled && cameraDevices.length > 0}
                        onChange={(e) => handleCameraEnabledChange(e.target.checked)}
                        disabled={setupLocked || cameraDevices.length === 0}
                      />
                      <span>On</span>
                    </label>
                  </div>
                  <select
                    id="av-camera"
                    className="studio-select"
                    value={cameraIndex ?? ""}
                    onChange={(e) =>
                      handleCameraChange(Number.parseInt(e.target.value, 10))
                    }
                    disabled={
                      setupLocked ||
                      cameraDevices.length === 0 ||
                      !cameraEnabled
                    }
                  >
                    {cameraDevices.map((d) => (
                      <option key={d.index} value={d.index}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {cameraDevices.length === 0 ? (
                    <p className="studio-setup-note">No camera detected.</p>
                  ) : (
                    <p className="studio-setup-note">
                      Shows a small circle in the bottom-left while recording.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </main>

        <footer className="studio-foot">
          <details className="studio-advanced">
            <summary>Advanced</summary>
            <div className="studio-advanced-body">
              <div className="studio-advanced-block">
                <div className="studio-advanced-head">
                  <span className="studio-advanced-title">Recorder log</span>
                </div>
                <pre className="studio-log">{log || "—"}</pre>
              </div>
              <div className="studio-advanced-block">
                <div className="studio-advanced-head">
                  <span className="studio-advanced-title">Diagnostics</span>
                  <button
                    type="button"
                    className="studio-text-btn"
                    onClick={() => void handleCopyDiagnostics()}
                    disabled={uiLockedForCountdown}
                  >
                    <Copy size={14} aria-hidden />
                    Copy
                  </button>
                </div>
                <pre className="studio-log studio-log--tall">
                  {diagnosticsEvents.length === 0
                    ? "—"
                    : diagnosticsEvents.map(formatDiagnosticsEvent).join("\n")}
                </pre>
              </div>
            </div>
          </details>
        </footer>
      </div>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {countdown !== null && !hasBridge ? (
        <div
          className="countdown-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="countdown-overlay-title"
          aria-describedby="countdown-overlay-value"
        >
          <p id="countdown-overlay-title" className="countdown-overlay-label">
            Recording starts in…
          </p>
          <p
            id="countdown-overlay-value"
            key={countdown}
            className="countdown-overlay-digit"
            aria-live="assertive"
          >
            {countdown}
          </p>
        </div>
      ) : null}
    </>
  );
}
