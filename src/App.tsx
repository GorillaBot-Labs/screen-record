import { useCallback, useEffect, useRef, useState } from 'react'

import type { AvfoundationDevice } from '../electron/preload'

const VIDEO_INDEX_STORAGE_KEY = 'screen-record:avVideoIndex'
const AUDIO_INDEX_STORAGE_KEY = 'screen-record:avAudioIndex'
/** Legacy single-field storage; migrated once into index keys when present. */
const LEGACY_AV_INPUT_KEY = 'screen-record:avfoundationInput'

function loadStoredIndex(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null || raw.trim().length === 0) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function persistIndex(key: string, index: number) {
  try {
    localStorage.setItem(key, String(index))
  } catch {
    /* ignore */
  }
}

function readLegacyAvPair(): { v: number; a: number } | null {
  try {
    const s = localStorage.getItem(LEGACY_AV_INPUT_KEY)?.trim()
    if (!s) return null
    const m = /^(\d+):(\d+)$/.exec(s)
    if (!m) return null
    const v = Number.parseInt(m[1], 10)
    const a = Number.parseInt(m[2], 10)
    if (!Number.isFinite(v) || !Number.isFinite(a)) return null
    return { v, a }
  } catch {
    return null
  }
}

function pickDefaultVideo(devices: AvfoundationDevice[]): number | null {
  if (devices.length === 0) return null
  if (devices.some((d) => d.index === 3)) return 3
  const screen = devices.find((d) => /capture screen|screen \d/i.test(d.name))
  return screen?.index ?? devices[0]!.index
}

function pickDefaultAudio(devices: AvfoundationDevice[]): number | null {
  if (devices.length === 0) return null
  if (devices.some((d) => d.index === 1)) return 1
  return devices[0]!.index
}

function sortByIndex(devices: AvfoundationDevice[]): AvfoundationDevice[] {
  return [...devices].sort((a, b) => a.index - b.index)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export default function App() {
  const [ffmpegInfo, setFfmpegInfo] = useState<string>('…')
  const [log, setLog] = useState<string>('')
  const [status, setStatus] = useState<string>('Idle')
  const [videoDevices, setVideoDevices] = useState<AvfoundationDevice[]>([])
  const [audioDevices, setAudioDevices] = useState<AvfoundationDevice[]>([])
  const [videoIndex, setVideoIndex] = useState<number | null>(null)
  const [audioIndex, setAudioIndex] = useState<number | null>(null)
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [devicesError, setDevicesError] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [finderHint, setFinderHint] = useState<string | null>(null)
  /** After ffmpeg exits: upload to GCS until we get `recording:gcs-upload`. */
  const [cloudUploading, setCloudUploading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  /** 3 → 2 → 1 fullscreen overlay before recording; `null` when hidden. */
  const [countdown, setCountdown] = useState<number | null>(null)
  const logRef = useRef<string>('')
  const outputPathRef = useRef<string | null>(null)
  outputPathRef.current = outputPath

  const applyDeviceSelection = useCallback(
    (video: AvfoundationDevice[], audio: AvfoundationDevice[]) => {
      const legacy = readLegacyAvPair()
      let v = loadStoredIndex(VIDEO_INDEX_STORAGE_KEY) ?? legacy?.v ?? null
      let a = loadStoredIndex(AUDIO_INDEX_STORAGE_KEY) ?? legacy?.a ?? null
      if (v == null || !video.some((d) => d.index === v)) v = pickDefaultVideo(video)
      if (a == null || !audio.some((d) => d.index === a)) a = pickDefaultAudio(audio)
      setVideoIndex(v)
      setAudioIndex(a)
      if (v != null) persistIndex(VIDEO_INDEX_STORAGE_KEY, v)
      if (a != null) persistIndex(AUDIO_INDEX_STORAGE_KEY, a)
    },
    [],
  )

  const refreshDevices = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    setDevicesLoading(true)
    setDevicesError(null)
    const res = await api.listAvfoundationDevices()
    setDevicesLoading(false)
    if (!res.ok) {
      setDevicesError(res.error)
      setVideoDevices([])
      setAudioDevices([])
      setVideoIndex(null)
      setAudioIndex(null)
      return
    }
    const video = sortByIndex(res.video)
    const audio = sortByIndex(res.audio)
    setVideoDevices(video)
    setAudioDevices(audio)
    applyDeviceSelection(video, audio)
  }, [applyDeviceSelection])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) {
      setFfmpegInfo('Renderer has no preload bridge (open via Electron).')
      return
    }

    void api.resolveFfmpegPath().then((res) => {
      setFfmpegInfo(res.path ?? res.error)
    })

    void refreshDevices()

    const offStderr = api.onRecordingStderr((chunk) => {
      logRef.current += chunk
      setLog(logRef.current)
    })

    const offEnded = api.onRecordingEnded(({ code, signal }) => {
      setRecording(false)
      setCloudUploading(true)
      setStatus(`Ended (code=${code}, signal=${signal ?? 'none'}). Uploading…`)
    })

    const offGcs = api.onRecordingGcsUpload((p) => {
      setCloudUploading(false)
      if (p.outputPath !== outputPathRef.current) return
      if (p.ok) {
        setShareUrl(p.url)
        setShareError(null)
        setStatus('Recording uploaded. Share link copied to the clipboard.')
      } else {
        setShareUrl(null)
        setShareError(p.error)
        setStatus('Recording saved locally, but cloud upload failed.')
      }
    })

    return () => {
      offStderr()
      offEnded()
      offGcs()
    }
  }, [refreshDevices])

  function handleVideoChange(index: number) {
    setVideoIndex(index)
    persistIndex(VIDEO_INDEX_STORAGE_KEY, index)
  }

  function handleAudioChange(index: number) {
    setAudioIndex(index)
    persistIndex(AUDIO_INDEX_STORAGE_KEY, index)
  }

  async function handleStart() {
    const api = window.electronAPI
    if (!api || videoIndex == null || audioIndex == null) return
    setFinderHint(null)

    setCountdown(3)
    const overlayRes = await api.overlay.open(3)
    if (!overlayRes.ok) {
      setCountdown(null)
      setStatus(`Could not open countdown overlay: ${overlayRes.error}`)
      return
    }

    const minRes = await api.minimizeWindow()
    if (!minRes.ok) {
      setStatus(`Could not minimize window: ${minRes.error}`)
    }

    await delay(1000)
    setCountdown(2)
    await api.overlay.setValue(2)
    await delay(1000)
    setCountdown(1)
    await api.overlay.setValue(1)
    await delay(1000)
    await api.overlay.close()
    setCountdown(null)

    logRef.current = ''
    setLog('')
    setStatus('Starting…')
    const input = `${videoIndex}:${audioIndex}`
    const res = await api.startRecording({ avfoundationInput: input })
    if (res.ok) {
      setRecording(true)
      setOutputPath(res.outputPath)
      setShareUrl(null)
      setShareError(null)
      setCloudUploading(false)
      setStatus(minRes.ok ? 'Recording' : 'Recording (window was not minimized)')
    } else {
      setStatus(`Start failed: ${res.error}`)
    }
  }

  async function handleStop() {
    const api = window.electronAPI
    if (!api) return
    const res = await api.stopRecording()
    if (res.ok) {
      setStatus('Stop sent (SIGINT); wait for ffmpeg to finalize…')
    } else {
      setStatus(res.error)
    }
  }

  async function handleRevealInFinder() {
    const api = window.electronAPI
    if (!api || !outputPath) return
    setFinderHint(null)
    const res = await api.revealInFinder(outputPath)
    if (!res.ok) {
      setFinderHint(res.error)
    }
  }

  async function handleCopyShareLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      /* user can select the link in the UI */
    }
  }

  const hasBridge = Boolean(window.electronAPI)
  const canRecord =
    hasBridge &&
    !recording &&
    countdown === null &&
    !devicesLoading &&
    devicesError == null &&
    videoIndex != null &&
    audioIndex != null &&
    videoDevices.length > 0 &&
    audioDevices.length > 0

  const uiLockedForCountdown = countdown !== null

  return (
    <>
    <main>
      <h1>Screen Record</h1>
      <p className="muted">ffmpeg: {ffmpegInfo}</p>

      <div className="field">
        <div className="field-header">
          <span id="capture-devices-label" className="field-label">
            Capture devices
          </span>
          <button
            type="button"
            className="linkish"
            onClick={() => void refreshDevices()}
            disabled={!hasBridge || recording || devicesLoading || uiLockedForCountdown}
          >
            Refresh
          </button>
        </div>
        {devicesLoading ? <p className="hint">Loading devices…</p> : null}
        {devicesError ? <p className="hint warn">{devicesError}</p> : null}
        {!devicesLoading && !devicesError ? (
          <>
            <label htmlFor="av-video" className="sub-label">
              Video (screen or camera)
            </label>
            <select
              id="av-video"
              value={videoIndex ?? ''}
              onChange={(e) => handleVideoChange(Number.parseInt(e.target.value, 10))}
              disabled={!hasBridge || recording || uiLockedForCountdown || videoDevices.length === 0}
              aria-labelledby="capture-devices-label"
            >
              {videoDevices.map((d) => (
                <option key={d.index} value={d.index}>
                  [{d.index}] {d.name}
                </option>
              ))}
            </select>

            <label htmlFor="av-audio" className="sub-label">
              Audio (microphone)
            </label>
            <select
              id="av-audio"
              value={audioIndex ?? ''}
              onChange={(e) => handleAudioChange(Number.parseInt(e.target.value, 10))}
              disabled={!hasBridge || recording || uiLockedForCountdown || audioDevices.length === 0}
              aria-labelledby="capture-devices-label"
            >
              {audioDevices.map((d) => (
                <option key={d.index} value={d.index}>
                  [{d.index}] {d.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <p id="av-input-hint" className="hint">
          Options come from <code>ffmpeg -f avfoundation -list_devices true -i &quot;&quot;</code>.
          Defaults favor screen index <code>3</code> and audio index <code>1</code> when those exist.
        </p>
      </div>

      <p className="status">{status}</p>

      <p className="actions">
        <button type="button" onClick={() => void handleStart()} disabled={!canRecord}>
          Start
        </button>{' '}
        <button type="button" onClick={() => void handleStop()} disabled={!hasBridge || !recording}>
          Stop
        </button>
      </p>
      {hasBridge ? (
        <p className="hint">
          After the window minimizes, click the Screen Record icon in the menu bar (macOS) or system tray to
          reopen the app or stop the recording.
        </p>
      ) : null}

      <section className="path-block" aria-label="Output file">
        <h2 className="path-heading">Output file</h2>
        {outputPath ? (
          <>
            <p className="path-line">
              <code>{outputPath}</code>
            </p>
            <p className="actions">
              <button type="button" onClick={() => void handleRevealInFinder()} disabled={!hasBridge}>
                Open in Finder
              </button>
            </p>
            {finderHint ? <p className="hint warn">{finderHint}</p> : null}
          </>
        ) : (
          <p className="muted path-placeholder">Start a recording to see the destination path.</p>
        )}
      </section>

      <section className="path-block" aria-label="Cloud share link">
        <h2 className="path-heading">Share link</h2>
        {cloudUploading ? <p className="hint">Uploading recording to Google Cloud…</p> : null}
        {shareError ? <p className="hint warn">{shareError}</p> : null}
        {shareUrl ? (
          <>
            <p className="share-hint hint">
              Link was copied to your clipboard when the upload finished. You can copy it again below.
            </p>
            <p className="path-line">
              <code className="share-url">{shareUrl}</code>
            </p>
            <p className="actions">
              <button type="button" onClick={() => void handleCopyShareLink()}>
                Copy link
              </button>
            </p>
          </>
        ) : !cloudUploading && !shareError ? (
          <p className="muted path-placeholder">
            When a recording finishes, the app uploads it to your GCS bucket and shows a read-only link here.
          </p>
        ) : null}
      </section>

      <h2 className="log-heading">ffmpeg log</h2>
      <pre className="log">{log || '—'}</pre>
    </main>

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
  )
}
