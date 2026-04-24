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

function statusToneClass(params: {
  recording: boolean
  cloudUploading: boolean
  devicesError: string | null
  shareError: string | null
  status: string
}): string {
  const { recording, cloudUploading, devicesError, shareError, status } = params
  if (recording) return 'app-status app-status--recording'
  if (cloudUploading) return 'app-status app-status--busy'
  if (devicesError != null || shareError != null) return 'app-status app-status--error'
  const s = status.toLowerCase()
  if (s.includes('failed') || s.includes('could not') || s.includes('cannot start')) {
    return 'app-status app-status--error'
  }
  if (s.includes('uploaded') || s.includes('clipboard')) {
    return 'app-status app-status--success'
  }
  if (s.includes('uploading') || s.includes('starting…') || s.includes('finalize')) {
    return 'app-status app-status--busy'
  }
  return 'app-status'
}

function recordingTitleFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    if (!name) return 'Recording'
    const withoutExt = name.replace(/\.mp4$/i, '')
    return withoutExt.length > 0 ? withoutExt : name
  } catch {
    return 'Recording'
  }
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
  /** After ffmpeg exits: upload to GCS until we get `recording:gcs-upload`. */
  const [cloudUploading, setCloudUploading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  /** Last up to five successful upload URLs (persisted under ~/.screen-record). */
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  /** 3 → 2 → 1 fullscreen overlay before recording; `null` when hidden. */
  const [countdown, setCountdown] = useState<number | null>(null)
  /** Blocks overlapping start/countdown; avoids depending on `countdown` in `handleStart` deps (tray listener stability). */
  const startRecordingSequenceRef = useRef(false)
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

  const refreshRecentRecordings = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const { urls } = await api.listRecentRecordings()
    setRecentUrls(urls)
  }, [])

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
    void refreshRecentRecordings()

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
        void refreshRecentRecordings()
        if (p.localFileDeleted) {
          setOutputPath(null)
        }
      } else {
        setShareUrl(null)
        setShareError(p.error)
        setStatus('Cloud upload failed.')
      }
    })

    return () => {
      offStderr()
      offEnded()
      offGcs()
    }
  }, [refreshDevices, refreshRecentRecordings])

  function handleVideoChange(index: number) {
    setVideoIndex(index)
    persistIndex(VIDEO_INDEX_STORAGE_KEY, index)
  }

  function handleAudioChange(index: number) {
    setAudioIndex(index)
    persistIndex(AUDIO_INDEX_STORAGE_KEY, index)
  }

  const handleStart = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return

    if (recording) {
      setStatus('Already recording.')
      return
    }
    if (startRecordingSequenceRef.current) {
      setStatus('Countdown already in progress.')
      return
    }
    if (devicesLoading) {
      setStatus('Still loading devices; try again in a moment.')
      return
    }
    if (devicesError != null) {
      setStatus(`Cannot start: ${devicesError}`)
      return
    }
    if (videoDevices.length === 0 || audioDevices.length === 0) {
      setStatus('No capture devices available.')
      return
    }
    if (videoIndex == null || audioIndex == null) {
      setStatus('Choose video and audio devices in the app first.')
      return
    }

    startRecordingSequenceRef.current = true
    let minRes: { ok: true } | { ok: false; error: string } = { ok: true }
    try {
      setCountdown(3)
      const overlayRes = await api.overlay.open(3)
      if (!overlayRes.ok) {
        setCountdown(null)
        setStatus(`Could not open countdown overlay: ${overlayRes.error}`)
        return
      }

      minRes = await api.minimizeWindow()
      if (!minRes.ok) {
        setStatus(`Could not minimize window: ${minRes.error}`)
      }

      let shown = 3
      while (shown > 0) {
        const { skipped } = await api.countdownWaitMs(1000)
        if (skipped) break
        shown -= 1
        if (shown > 0) {
          setCountdown(shown)
          await api.overlay.setValue(shown)
        }
      }

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
    } finally {
      startRecordingSequenceRef.current = false
    }
  }, [
    audioDevices.length,
    audioIndex,
    devicesError,
    devicesLoading,
    recording,
    videoDevices.length,
    videoIndex,
  ])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onTrayStartRecordingRequest) return
    const off = api.onTrayStartRecordingRequest(() => {
      void handleStart()
    })
    return () => {
      off()
    }
  }, [handleStart])

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

  async function handleCopyShareLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      /* user can select the link in the UI */
    }
  }

  async function handleCopyRecordingUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied to the clipboard.')
    } catch {
      setStatus('Could not copy automatically—select the link text below.')
    }
  }

  async function handleOpenRecordingUrl(url: string) {
    const api = window.electronAPI
    if (!api) return
    const res = await api.openExternalUrl(url)
    if (!res.ok) {
      setStatus(`Could not open link: ${res.error}`)
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
  const statusClass = statusToneClass({
    recording,
    cloudUploading,
    devicesError,
    shareError,
    status,
  })

  return (
    <>
      <div className="app">
        <div className="app-container">
          <header className="app-header">
            <div className="app-brand">
              <span className="app-mark" aria-hidden />
              <div>
                <h1>Screen Record</h1>
                <p className="app-tagline">Screen and microphone capture, then upload to get a shareable link.</p>
              </div>
            </div>
            {!hasBridge ? (
              <p className="app-banner" role="status">
                Open this app in Electron to record. The web preview has no system bridge.
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
                disabled={!hasBridge || recording || devicesLoading || uiLockedForCountdown}
              >
                Refresh devices
              </button>
            </div>
            <div className="app-card-body">
              {devicesLoading ? <p className="hint">Loading devices…</p> : null}
              {devicesError ? <p className="hint warn">{devicesError}</p> : null}
              {!devicesLoading && !devicesError ? (
                <div className="device-grid">
                  <div>
                    <div className="field-label-row">
                      <label htmlFor="av-video" className="sub-label">
                        Video
                      </label>
                    </div>
                    <select
                      id="av-video"
                      className="app-select"
                      value={videoIndex ?? ''}
                      onChange={(e) => handleVideoChange(Number.parseInt(e.target.value, 10))}
                      disabled={!hasBridge || recording || uiLockedForCountdown || videoDevices.length === 0}
                      aria-labelledby="capture-heading"
                    >
                      {videoDevices.map((d) => (
                        <option key={d.index} value={d.index}>
                          [{d.index}] {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="field-label-row">
                      <label htmlFor="av-audio" className="sub-label">
                        Audio
                      </label>
                    </div>
                    <select
                      id="av-audio"
                      className="app-select"
                      value={audioIndex ?? ''}
                      onChange={(e) => handleAudioChange(Number.parseInt(e.target.value, 10))}
                      disabled={!hasBridge || recording || uiLockedForCountdown || audioDevices.length === 0}
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
            <button type="button" className="btn btn-primary" onClick={() => void handleStart()} disabled={!canRecord}>
              Start recording
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void handleStop()}
              disabled={!hasBridge || !recording}
            >
              Stop
            </button>
            {hasBridge ? (
              <p className="app-actions-hint">
                After you start, the window minimizes. Use the menu bar (macOS) or system tray icon to open the app
                or stop recording.
              </p>
            ) : null}
          </div>

          {hasBridge ? (
            <section className="app-card" aria-labelledby="recent-heading">
              <div className="app-card-header">
                <h2 id="recent-heading" className="app-card-title">
                  Recent uploads
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void refreshRecentRecordings()}
                  disabled={recording || uiLockedForCountdown}
                >
                  Refresh
                </button>
              </div>
              <div className="app-card-body">
                {recentUrls.length === 0 ? (
                  <p className="hint hint-flush">
                    Up to five successful uploads from this Mac are kept here. Finish a recording to build the list.
                  </p>
                ) : (
                  <ul className="recent-list" role="list">
                    {recentUrls.map((url) => (
                      <li key={url} className="recent-item">
                        <div className="recent-item-main">
                          <span className="recent-item-title">{recordingTitleFromUrl(url)}</span>
                          <code className="recent-item-url" title={url}>
                            {url}
                          </code>
                        </div>
                        <div className="recent-item-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-compact"
                            onClick={() => void handleCopyRecordingUrl(url)}
                          >
                            Copy link
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-compact"
                            onClick={() => void handleOpenRecordingUrl(url)}
                          >
                            Open in browser
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          <section className="app-card" aria-labelledby="share-heading">
            <div className="app-card-header">
              <h2 id="share-heading" className="app-card-title">
                Share link
              </h2>
            </div>
            <div className="app-card-body">
              {cloudUploading ? <p className="hint">Uploading to Google Cloud…</p> : null}
              {shareError ? <p className="hint warn">{shareError}</p> : null}
              {shareUrl ? (
                <>
                  <p className="hint hint-flush">
                    The link was copied when upload finished. You can copy it again below.
                  </p>
                  <p className="path-line">
                    <code className="share-url">{shareUrl}</code>
                  </p>
                  <div className="inline-actions">
                    <button type="button" className="btn btn-outline" onClick={() => void handleCopyShareLink()}>
                      Copy link
                    </button>
                  </div>
                </>
              ) : !cloudUploading && !shareError ? (
                <p className="path-placeholder">When a recording ends, a public link from your GCS bucket appears here.</p>
              ) : null}
            </div>
          </section>

          <details className="app-details">
            <summary>Technical details</summary>
            <div className="app-details-body">
              <p>
                <strong>ffmpeg</strong> — <code>{ffmpegInfo}</code>
              </p>
              <p>
                Device lists come from{' '}
                <code>ffmpeg -f avfoundation -list_devices true -i &quot;&quot;</code>. Defaults prefer screen index{' '}
                <code>3</code> and microphone index <code>1</code> when present.
              </p>
            </div>
          </details>

          <details className="app-details">
            <summary>ffmpeg log</summary>
            <div className="app-details-body">
              <pre className="log">{log || '—'}</pre>
            </div>
          </details>
        </div>
      </div>

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
