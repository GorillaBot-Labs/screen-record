import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CaptureDevice,
  CaptureDisplayScreenshotResult,
} from "../electron/preload";

const VIDEO_INDEX_STORAGE_KEY = "screen-record:avVideoIndex";
const AUDIO_INDEX_STORAGE_KEY = "screen-record:avAudioIndex";
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

function sortByIndex(devices: CaptureDevice[]): CaptureDevice[] {
  return [...devices].sort((a, b) => a.index - b.index);
}

function statusToneClass(params: {
  recording: boolean;
  cloudUploading: boolean;
  devicesError: string | null;
  shareError: string | null;
  status: string;
}): string {
  const { recording, cloudUploading, devicesError, shareError, status } =
    params;
  if (recording) return "app-status app-status--recording";
  if (cloudUploading) return "app-status app-status--busy";
  if (devicesError != null || shareError != null)
    return "app-status app-status--error";
  const s = status.toLowerCase();
  if (
    s.includes("failed") ||
    s.includes("could not") ||
    s.includes("cannot start")
  ) {
    return "app-status app-status--error";
  }
  if (s.includes("uploaded") || s.includes("clipboard")) {
    return "app-status app-status--success";
  }
  if (
    s.includes("uploading") ||
    s.includes("starting…") ||
    s.includes("finalize")
  ) {
    return "app-status app-status--busy";
  }
  return "app-status";
}

function recordingTitleFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(
      new URL(url).pathname.split("/").pop() ?? "",
    );
    if (!name) return "Recording";
    const withoutExt = name.replace(/\.mp4$/i, "");
    return withoutExt.length > 0 ? withoutExt : name;
  } catch {
    return "Recording";
  }
}

export default function App() {
  const [log, setLog] = useState<string>("");
  const [status, setStatus] = useState<string>("Idle");
  const [videoDevices, setVideoDevices] = useState<CaptureDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<CaptureDevice[]>([]);
  const [videoIndex, setVideoIndex] = useState<number | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [displayPreview, setDisplayPreview] = useState<
    | { kind: "loading"; index: number }
    | { kind: "ready"; index: number; dataUrl: string; width: number; height: number }
    | { kind: "error"; index: number; message: string }
    | null
  >(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [screenReadiness, setScreenReadiness] = useState<
    | { kind: "unknown" }
    | { kind: "checking" }
    | { kind: "ready" }
    | { kind: "blocked"; message: string }
  >({ kind: "unknown" });
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingStartedAtMs, setRecordingStartedAtMs] = useState<number | null>(
    null,
  );
  const [stopRequested, setStopRequested] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  /** After sck-record exits: upload to GCS until we get `recording:gcs-upload`. */
  const [cloudUploading, setCloudUploading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [diagnosticsEvents, setDiagnosticsEvents] = useState<DiagnosticsEvent[]>(
    [],
  );
  /** Last up to five successful upload URLs (persisted under ~/.screen-record). */
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
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
    (video: CaptureDevice[], audio: CaptureDevice[]) => {
      const legacy = readLegacyAvPair();
      let v = loadStoredIndex(VIDEO_INDEX_STORAGE_KEY) ?? legacy?.v ?? null;
      let a = loadStoredIndex(AUDIO_INDEX_STORAGE_KEY) ?? legacy?.a ?? null;
      if (v == null || !video.some((d) => d.index === v))
        v = pickDefaultVideo(video);
      if (a == null || !audio.some((d) => d.index === a))
        a = pickDefaultAudio(audio);
      setVideoIndex(v);
      setAudioIndex(a);
      if (v != null) persistIndex(VIDEO_INDEX_STORAGE_KEY, v);
      if (a != null) persistIndex(AUDIO_INDEX_STORAGE_KEY, a);
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
      setVideoIndex(null);
      setAudioIndex(null);
      return;
    }
    const video = sortByIndex(res.video);
    const audio = sortByIndex(res.audio);
    pushDiagnosticsEvent({
      kind: "devices.refresh.ok",
      data: {
        ms: Math.round(performance.now() - t0),
        videoCount: video.length,
        audioCount: audio.length,
      },
    });
    setVideoDevices(video);
    setAudioDevices(audio);
    applyDeviceSelection(video, audio);
  }, [applyDeviceSelection, pushDiagnosticsEvent]);

  const refreshDisplayPreview = useCallback(
    async (index: number) => {
      type ElectronAPIWithScreenshot = NonNullable<typeof window.electronAPI> & {
        captureDisplayScreenshot?: (
          displayIdOrIndex: number,
        ) => Promise<CaptureDisplayScreenshotResult>;
      };
      const api = window.electronAPI as ElectronAPIWithScreenshot | undefined;
      if (!api?.captureDisplayScreenshot) return;
      const device = videoDevices.find((d) => d.index === index);
      const selector = device?.displayId ?? index;
      const t0 = performance.now();
      pushDiagnosticsEvent({
        kind: "preview.refresh.start",
        data: { index, selector },
      });
      setDisplayPreview({ kind: "loading", index });
      const res = await api.captureDisplayScreenshot(selector);
      if (res.ok) {
        pushDiagnosticsEvent({
          kind: "preview.refresh.ok",
          data: {
            index,
            selector,
            ms: Math.round(performance.now() - t0),
            width: res.width,
            height: res.height,
          },
        });
        setDisplayPreview({
          kind: "ready",
          index,
          dataUrl: `data:image/png;base64,${res.pngBase64}`,
          width: res.width,
          height: res.height,
        });
      } else {
        pushDiagnosticsEvent({
          kind: "preview.refresh.error",
          message: res.error,
          data: { index, selector, ms: Math.round(performance.now() - t0) },
        });
        setDisplayPreview({
          kind: "error",
          index,
          message: res.error,
        });
      }
    },
    [pushDiagnosticsEvent, videoDevices],
  );

  const checkScreenRecordingReadiness = useCallback(
    async (index: number) => {
      const api = window.electronAPI;
      if (!api?.captureDisplayScreenshot) return;
      const device = videoDevices.find((d) => d.index === index);
      const selector = device?.displayId ?? index;

      setScreenReadiness({ kind: "checking" });
      const t0 = performance.now();
      pushDiagnosticsEvent({
        kind: "permission.screen.check.start",
        data: { index, selector },
      });

      const attempt = async () => api.captureDisplayScreenshot(selector);
      const res1 = await attempt();
      const res =
        res1.ok ? res1 : await new Promise<CaptureDisplayScreenshotResult>((r) => {
          window.setTimeout(() => {
            void attempt().then(r);
          }, 250);
        });

      if (res.ok) {
        pushDiagnosticsEvent({
          kind: "permission.screen.check.ok",
          data: { index, selector, ms: Math.round(performance.now() - t0) },
        });
        setScreenReadiness({ kind: "ready" });
      } else {
        pushDiagnosticsEvent({
          kind: "permission.screen.check.blocked",
          message: res.error,
          data: { index, selector, ms: Math.round(performance.now() - t0) },
        });
        setScreenReadiness({
          kind: "blocked",
          message: res.error,
        });
      }
    },
    [pushDiagnosticsEvent, videoDevices],
  );

  const refreshRecentRecordings = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    const { urls } = await api.listRecentRecordings();
    pushDiagnosticsEvent({ kind: "recent.refresh", data: { count: urls.length } });
    setRecentUrls(urls);
  }, [pushDiagnosticsEvent]);

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
    void refreshRecentRecordings();

    const offStderr = api.onRecordingStderr((chunk) => {
      logRef.current += chunk;
      setLog(logRef.current);
    });

    const offEnded = api.onRecordingEnded(({ code, signal }) => {
      pushDiagnosticsEvent({
        kind: "recording.ended",
        data: { code, signal, outputPath: outputPathRef.current },
      });
      setRecording(false);
      setRecordingStartedAtMs(null);
      setStopRequested(false);
      setCloudUploading(true);
      setStatus(`Ended (code=${code}, signal=${signal ?? "none"}). Uploading…`);
    });

    const offGcs = api.onRecordingGcsUpload((p) => {
      pushDiagnosticsEvent({
        kind: p.ok ? "upload.ok" : "upload.error",
        message: p.ok ? undefined : p.error,
        data: p.ok
          ? { url: p.url, outputPath: p.outputPath, localFileDeleted: p.localFileDeleted }
          : { outputPath: p.outputPath },
      });
      setCloudUploading(false);
      if (p.outputPath !== outputPathRef.current) return;
      if (p.ok) {
        setShareUrl(p.url);
        setShareError(null);
        setStatus("Recording uploaded. Share link copied to the clipboard.");
        void refreshRecentRecordings();
        if (p.localFileDeleted) {
          setOutputPath(null);
        }
      } else {
        setShareUrl(null);
        setShareError(p.error);
        setStatus("Cloud upload failed.");
      }
    });

    return () => {
      offStderr();
      offEnded();
      offGcs();
    };
  }, [pushDiagnosticsEvent, refreshDevices, refreshRecentRecordings]);

  useEffect(() => {
    if (toast == null) return;
    const id = window.setTimeout(() => {
      setToast(null);
    }, 1600);
    return () => {
      window.clearTimeout(id);
    };
  }, [toast]);

  useEffect(() => {
    if (!recording || recordingStartedAtMs == null) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [recording, recordingStartedAtMs]);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (videoIndex == null) return;
    if (devicesLoading) return;
    if (devicesError != null) return;
    void refreshDisplayPreview(videoIndex);
  }, [devicesError, devicesLoading, refreshDisplayPreview, videoIndex]);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (videoIndex == null) return;
    if (devicesLoading) return;
    if (devicesError != null) return;
    void checkScreenRecordingReadiness(videoIndex);
  }, [checkScreenRecordingReadiness, devicesError, devicesLoading, videoIndex]);

  function resolutionFromDeviceName(name: string): string | null {
    const m = /(\d{3,5})\s*[x×]\s*(\d{3,5})/.exec(name);
    if (!m) return null;
    const w = Number.parseInt(m[1], 10);
    const h = Number.parseInt(m[2], 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return `${w}×${h}`;
  }

  function formatElapsed(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
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
    if (screenReadiness.kind !== "ready") {
      setStatus(
        screenReadiness.kind === "blocked"
          ? "Screen Recording permission is not ready yet. Open System Settings → Privacy & Security → Screen Recording, enable Screen Record, then click Recheck."
          : "Checking Screen Recording permission…",
      );
      pushDiagnosticsEvent({
        kind: "recording.start.blocked",
        message:
          screenReadiness.kind === "blocked"
            ? "Screen Recording permission blocked"
            : "Screen Recording permission checking",
      });
      if (videoIndex != null) {
        void checkScreenRecordingReadiness(videoIndex);
      }
      return;
    }

    startRecordingSequenceRef.current = true;
    let minRes: { ok: true } | { ok: false; error: string } = { ok: true };
    try {
      pushDiagnosticsEvent({
        kind: "recording.start.sequence.begin",
        data: { videoIndex, audioIndex },
      });
      setCountdown(3);
      const overlayRes = await api.overlay.open(3);
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
      const input = `${videoIndex}:${audioIndex}`;
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
        setRecordingStartedAtMs(res.recordingStartedAtMs);
        setStopRequested(false);
        setOutputPath(res.outputPath);
        setShareUrl(null);
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
    checkScreenRecordingReadiness,
    devicesError,
    devicesLoading,
    recording,
    screenReadiness.kind,
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

  async function handleStop() {
    const api = window.electronAPI;
    if (!api) return;
    const res = await api.stopRecording();
    if (res.ok) {
      pushDiagnosticsEvent({ kind: "recording.stop.sent" });
      setStopRequested(true);
      setStatus("Stop sent (SIGINT); wait for the recorder to finalize…");
    } else {
      pushDiagnosticsEvent({ kind: "recording.stop.error", message: res.error });
      setStatus(res.error);
    }
  }

  function showToast(message: string) {
    setToast(message);
  }

  async function handleCopyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      pushDiagnosticsEvent({ kind: "clipboard.copy.shareUrl.ok" });
      showToast("Copied");
    } catch {
      pushDiagnosticsEvent({ kind: "clipboard.copy.shareUrl.error" });
      /* user can select the link in the UI */
    }
  }

  async function handleCopyRecordingUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      pushDiagnosticsEvent({ kind: "clipboard.copy.recentUrl.ok" });
      showToast("Copied");
    } catch {
      pushDiagnosticsEvent({ kind: "clipboard.copy.recentUrl.error" });
      setStatus("Could not copy automatically—select the link text below.");
    }
  }

  async function handleOpenRecordingUrl(url: string) {
    const api = window.electronAPI;
    if (!api) return;
    const res = await api.openExternalUrl(url);
    if (!res.ok) {
      pushDiagnosticsEvent({ kind: "shell.openExternal.error", message: res.error });
      setStatus(`Could not open link: ${res.error}`);
    } else {
      pushDiagnosticsEvent({ kind: "shell.openExternal.ok" });
    }
  }

  async function handleRevealOutputPath() {
    const api = window.electronAPI;
    if (!api) return;
    if (!outputPath) return;
    const res = await api.revealInFinder(outputPath);
    if (!res.ok) {
      pushDiagnosticsEvent({ kind: "finder.reveal.error", message: res.error });
      setStatus(`Could not reveal file: ${res.error}`);
    } else {
      pushDiagnosticsEvent({ kind: "finder.reveal.ok" });
    }
  }

  async function handleCopyDiagnostics() {
    const header = [
      "Screen Record — diagnostics",
      `capturedAt=${new Date().toISOString()}`,
      `hasBridge=${String(Boolean(window.electronAPI))}`,
      `userAgent=${navigator.userAgent}`,
      `platform=${navigator.platform}`,
      `language=${navigator.language}`,
      `timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `recording=${String(recording)}`,
      `cloudUploading=${String(cloudUploading)}`,
      `devicesLoading=${String(devicesLoading)}`,
      `devicesError=${devicesError ?? ""}`,
      `screenReadiness=${screenReadiness.kind}`,
      `videoDevices=${videoDevices.length}`,
      `audioDevices=${audioDevices.length}`,
      `videoIndex=${videoIndex ?? ""}`,
      `audioIndex=${audioIndex ?? ""}`,
      `shareUrl=${shareUrl ?? ""}`,
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
    screenReadiness.kind === "ready" &&
    videoIndex != null &&
    audioIndex != null &&
    videoDevices.length > 0 &&
    audioDevices.length > 0;

  const uiLockedForCountdown = countdown !== null;
  const statusClass = statusToneClass({
    recording,
    cloudUploading,
    devicesError,
    shareError,
    status,
  });

  const stripPhase:
    | "idle"
    | "countdown"
    | "recording"
    | "stopping"
    | "uploading"
    | "uploaded"
    | "error" = (() => {
    if (!hasBridge) return "idle";
    if (devicesError != null) return "error";
    if (recording && stopRequested) return "stopping";
    if (recording) return "recording";
    if (countdown !== null) return "countdown";
    if (cloudUploading) return "uploading";
    if (shareUrl) return "uploaded";
    if (shareError) return "error";
    return "idle";
  })();

  const stripToneClass =
    stripPhase === "recording" || stripPhase === "stopping"
      ? "recording-strip recording-strip--recording"
      : stripPhase === "uploading" || stripPhase === "countdown"
        ? "recording-strip recording-strip--busy"
        : stripPhase === "uploaded"
          ? "recording-strip recording-strip--success"
          : stripPhase === "error"
            ? "recording-strip recording-strip--error"
            : "recording-strip";

  const stripTitle = (() => {
    switch (stripPhase) {
      case "recording":
        return "Recording";
      case "stopping":
        return "Stopping…";
      case "uploading":
        return "Uploading…";
      case "countdown":
        return `Starting in ${countdown ?? 0}…`;
      case "uploaded":
        return "Uploaded";
      case "error":
        return "Needs attention";
      case "idle":
      default:
        return "Ready";
    }
  })();

  const stripDetail = (() => {
    if (stripPhase === "recording" || stripPhase === "stopping") {
      if (recordingStartedAtMs == null) return null;
      return formatElapsed(nowMs - recordingStartedAtMs);
    }
    return null;
  })();

  return (
    <>
      <div className="app">
        <div className="app-container">
          <div className={stripToneClass} role="status" aria-live="polite">
            <div className="recording-strip-left">
              <span className="recording-strip-title">{stripTitle}</span>
              {stripDetail ? (
                <span className="recording-strip-detail">{stripDetail}</span>
              ) : null}
            </div>
            <div className="recording-strip-right">
              {stripPhase === "recording" || stripPhase === "stopping" ? (
                <button
                  type="button"
                  className="btn btn-danger btn-compact"
                  onClick={() => void handleStop()}
                  disabled={!hasBridge || !recording || stopRequested}
                >
                  Stop
                </button>
              ) : null}
            </div>
          </div>

          <header className="app-header">
            <div className="app-brand">
              <span className="app-mark" aria-hidden />
              <div>
                <h1>Screen Record</h1>
                <p className="app-tagline">
                  Screen and microphone capture, then upload to get a shareable
                  link.
                </p>
              </div>
            </div>
            {!hasBridge ? (
              <p className="app-banner" role="status">
                Open this app in Electron to record. The web preview has no
                system bridge.
              </p>
            ) : null}
            <p className={statusClass} role="status" aria-live="polite">
              {status}
            </p>
          </header>

          <section className="app-card" aria-labelledby="capture-heading">
            <div className="app-card-header">
              <h2 id="capture-heading" className="app-card-title">
                Capture
              </h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void refreshDevices()}
                disabled={
                  !hasBridge ||
                  recording ||
                  devicesLoading ||
                  uiLockedForCountdown
                }
              >
                Refresh devices
              </button>
            </div>
            <div className="app-card-body">
              {hasBridge && !devicesLoading && devicesError == null ? (
                <div
                  className={
                    screenReadiness.kind === "ready"
                      ? "readiness readiness--ready"
                      : screenReadiness.kind === "checking"
                        ? "readiness readiness--checking"
                        : screenReadiness.kind === "blocked"
                          ? "readiness readiness--blocked"
                          : "readiness"
                  }
                  role="status"
                  aria-live="polite"
                >
                  <div className="readiness-main">
                    <div className="readiness-title">Screen Recording</div>
                    <div className="readiness-sub">
                      {screenReadiness.kind === "ready"
                        ? "Ready"
                        : screenReadiness.kind === "checking"
                          ? "Checking…"
                          : screenReadiness.kind === "blocked"
                            ? "Permission required"
                            : "Not checked yet"}
                    </div>
                  </div>

                  {screenReadiness.kind === "blocked" ? (
                    <p className="readiness-detail">
                      Grant permission in System Settings → Privacy &amp;
                      Security → Screen Recording, then restart the app if macOS
                      asks you to.
                      <span className="readiness-detail-muted">
                        {" "}
                        Error: {screenReadiness.message}
                      </span>
                    </p>
                  ) : null}

                  <div className="readiness-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-compact"
                      onClick={() => void window.electronAPI?.openScreenRecordingSettings?.()}
                      disabled={uiLockedForCountdown || recording}
                    >
                      Open System Settings
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => {
                        if (videoIndex != null) {
                          void checkScreenRecordingReadiness(videoIndex);
                          void refreshDisplayPreview(videoIndex);
                        }
                      }}
                      disabled={
                        uiLockedForCountdown ||
                        recording ||
                        devicesLoading ||
                        videoIndex == null ||
                        screenReadiness.kind === "checking"
                      }
                    >
                      Recheck
                    </button>
                  </div>
                </div>
              ) : null}
              {devicesLoading ? <p className="hint">Loading devices…</p> : null}
              {devicesError ? (
                <p className="hint warn">{devicesError}</p>
              ) : null}
              {!devicesLoading && !devicesError ? (
                <div className="device-grid">
                  <div className="device-grid-item device-grid-item--full">
                    <div className="field-label-row">
                      <span className="sub-label" id="screen-picker-label">
                        Screen
                      </span>
                    </div>
                    <div
                      className="screen-picker"
                      role="radiogroup"
                      aria-labelledby="screen-picker-label"
                    >
                      {videoDevices.map((d) => {
                        const selected = d.index === videoIndex;
                        const disabled =
                          !hasBridge ||
                          recording ||
                          uiLockedForCountdown ||
                          videoDevices.length === 0;
                        const resolution = resolutionFromDeviceName(d.name);
                        return (
                          <button
                            key={d.index}
                            type="button"
                            className={
                              selected
                                ? "screen-card screen-card--selected"
                                : "screen-card"
                            }
                            onClick={() => handleVideoChange(d.index)}
                            disabled={disabled}
                            role="radio"
                            aria-checked={selected}
                          >
                            <span className="screen-card-screen" aria-hidden />
                            <span className="screen-card-text">
                              <span className="screen-card-title">{d.name}</span>
                              <span className="screen-card-meta">
                                {resolution ? `${resolution} · ` : null}Index{" "}
                                {d.index}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {hasBridge && videoIndex != null ? (
                      <div className="display-preview" aria-live="polite">
                        <div className="display-preview-screen">
                          {displayPreview?.kind === "loading" &&
                          displayPreview.index === videoIndex ? (
                            <p className="hint hint-flush display-preview-center">
                              Loading preview…
                            </p>
                          ) : null}
                          {displayPreview?.kind === "error" &&
                          displayPreview.index === videoIndex ? (
                            <p className="hint warn hint-flush display-preview-center">
                              {displayPreview.message}
                            </p>
                          ) : null}
                          {displayPreview?.kind === "ready" &&
                          displayPreview.index === videoIndex ? (
                            <img
                              className="display-preview-image"
                              src={displayPreview.dataUrl}
                              alt="Screenshot of the selected display"
                            />
                          ) : null}
                          {!displayPreview ? (
                            <p className="hint hint-flush display-preview-center">
                              Pick a display to see a preview.
                            </p>
                          ) : null}
                        </div>

                        <div className="display-preview-actions">
                          <span className="display-preview-label">
                            Selected display preview
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            onClick={() => void refreshDisplayPreview(videoIndex)}
                            disabled={
                              recording || uiLockedForCountdown || devicesLoading
                            }
                          >
                            Refresh preview
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="device-grid-item device-grid-item--full">
                    <div className="field-label-row">
                      <label htmlFor="av-audio" className="sub-label">
                        Audio
                      </label>
                    </div>
                    <select
                      id="av-audio"
                      className="app-select"
                      value={audioIndex ?? ""}
                      onChange={(e) =>
                        handleAudioChange(Number.parseInt(e.target.value, 10))
                      }
                      disabled={
                        !hasBridge ||
                        recording ||
                        uiLockedForCountdown ||
                        audioDevices.length === 0
                      }
                      aria-labelledby="capture-heading"
                    >
                      {audioDevices.map((d) => (
                        <option key={d.index} value={d.index}>
                          [{d.index}] {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className="app-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleStart()}
              disabled={!canRecord}
            >
              Start recording
            </button>
            {hasBridge ? (
              <p className="app-actions-hint">
                After you start, the window minimizes. Use the menu bar (macOS)
                or system tray icon to open the app or stop recording.
              </p>
            ) : null}
          </div>

          <section className="app-card" aria-labelledby="share-heading">
            <div className="app-card-header">
              <h2 id="share-heading" className="app-card-title">
                Share link
              </h2>
            </div>
            <div className="app-card-body">
              {cloudUploading ? (
                <p className="hint">Uploading to Google Cloud…</p>
              ) : null}
              {shareError ? <p className="hint warn">{shareError}</p> : null}
              {shareUrl ? (
                <>
                  <div className="share-ready">
                    <div className="share-ready-header">
                      <div className="share-ready-title">Ready to share</div>
                      <div className="share-ready-sub">
                        Link is public and was copied automatically.
                      </div>
                    </div>
                    <div className="share-ready-field">
                      <input
                        className="share-ready-input"
                        value={shareUrl}
                        readOnly
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label="Share link"
                      />
                    </div>
                  </div>
                  <div className="inline-actions inline-actions--share">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleCopyShareLink()}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void handleOpenRecordingUrl(shareUrl)}
                    >
                      Open
                    </button>
                    {outputPath ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleRevealOutputPath()}
                      >
                        Reveal file
                      </button>
                    ) : null}
                  </div>
                </>
              ) : !cloudUploading && !shareError ? (
                <p className="path-placeholder">
                  When a recording ends, a public link from your GCS bucket
                  appears here.
                </p>
              ) : null}
            </div>
          </section>

          {hasBridge ? (
            <details className="app-details" aria-labelledby="recent-heading">
              <summary id="recent-heading">
                <span>Recent uploads</span>
                <span className="app-details-meta">
                  {recentUrls.length > 0 ? `${recentUrls.length}` : ""}
                </span>
              </summary>
              <div className="app-details-body">
                <div className="recent-controls">
                  <p className="hint hint-flush recent-hint">
                    Up to five successful uploads from this Mac are kept here.
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void refreshRecentRecordings()}
                    disabled={recording || uiLockedForCountdown}
                  >
                    Refresh
                  </button>
                </div>

                {recentUrls.length === 0 ? (
                  <p className="hint hint-flush">
                    Finish a recording to build the list.
                  </p>
                ) : (
                  <ul className="recent-list" role="list">
                    {recentUrls.map((url) => (
                      <li key={url} className="recent-item">
                        <div className="recent-item-header">
                          <span className="recent-item-title">
                            {recordingTitleFromUrl(url)}
                          </span>
                          <div className="recent-item-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-compact"
                              onClick={() => void handleCopyRecordingUrl(url)}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-compact"
                              onClick={() => void handleOpenRecordingUrl(url)}
                            >
                              Open
                            </button>
                          </div>
                        </div>
                        <code className="recent-item-url" title={url}>
                          {url}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ) : null}

          <details className="app-details">
            <summary>Recorder log</summary>
            <div className="app-details-body">
              <pre className="log">{log || "—"}</pre>
            </div>
          </details>

          <details className="app-details" aria-labelledby="diagnostics-heading">
            <summary id="diagnostics-heading">
              <span>Diagnostics</span>
              <span className="app-details-meta">
                {diagnosticsEvents.length > 0 ? `${diagnosticsEvents.length}` : ""}
              </span>
            </summary>
            <div className="app-details-body">
              <div className="diagnostics-controls">
                <p className="hint hint-flush">
                  Copy this when filing a bug or support ticket.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => void handleCopyDiagnostics()}
                  disabled={uiLockedForCountdown}
                >
                  Copy diagnostics
                </button>
              </div>
              <pre className="log log--diagnostics">
                {diagnosticsEvents.length === 0
                  ? "—"
                  : diagnosticsEvents.map(formatDiagnosticsEvent).join("\n")}
              </pre>
            </div>
          </details>
        </div>
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
