import { useCallback, useEffect, useRef, useState } from 'react'

const AV_INPUT_STORAGE_KEY = 'screen-record:avfoundationInput'
const DEFAULT_AV_INPUT = '3:1'

function loadStoredAvInput(): string {
  try {
    const v = localStorage.getItem(AV_INPUT_STORAGE_KEY)
    if (v != null && v.trim().length > 0) return v.trim()
  } catch {
    /* ignore */
  }
  return DEFAULT_AV_INPUT
}

export default function App() {
  const [ffmpegInfo, setFfmpegInfo] = useState<string>('…')
  const [log, setLog] = useState<string>('')
  const [status, setStatus] = useState<string>('Idle')
  const [avInput, setAvInput] = useState(loadStoredAvInput)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [finderHint, setFinderHint] = useState<string | null>(null)
  const logRef = useRef<string>('')

  const persistAvInput = useCallback((value: string) => {
    try {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        localStorage.removeItem(AV_INPUT_STORAGE_KEY)
      } else {
        localStorage.setItem(AV_INPUT_STORAGE_KEY, trimmed)
      }
    } catch {
      /* ignore */
    }
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

    const offStderr = api.onRecordingStderr((chunk) => {
      logRef.current += chunk
      setLog(logRef.current)
    })

    const offEnded = api.onRecordingEnded(({ code, signal }) => {
      setRecording(false)
      setStatus(`Ended (code=${code}, signal=${signal ?? 'none'})`)
    })

    return () => {
      offStderr()
      offEnded()
    }
  }, [])

  function handleAvInputChange(next: string) {
    setAvInput(next)
    persistAvInput(next)
  }

  async function handleStart() {
    const api = window.electronAPI
    if (!api) return
    setFinderHint(null)
    logRef.current = ''
    setLog('')
    setStatus('Starting…')
    const input = avInput.trim() || DEFAULT_AV_INPUT
    const res = await api.startRecording({ avfoundationInput: input })
    if (res.ok) {
      setRecording(true)
      setOutputPath(res.outputPath)
      setStatus('Recording')
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

  const hasBridge = Boolean(window.electronAPI)
  const effectiveInput = avInput.trim() || DEFAULT_AV_INPUT

  return (
    <main>
      <h1>Screen Record</h1>
      <p className="muted">ffmpeg: {ffmpegInfo}</p>

      <div className="field">
        <label htmlFor="av-input">AVFoundation input</label>
        <input
          id="av-input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder={DEFAULT_AV_INPUT}
          value={avInput}
          onChange={(e) => handleAvInputChange(e.target.value)}
          disabled={!hasBridge || recording}
          aria-describedby="av-input-hint"
        />
        <p id="av-input-hint" className="hint">
          Video:audio device indices passed to <code>ffmpeg -i</code> (default <code>{DEFAULT_AV_INPUT}</code>).
          Saved locally.
        </p>
      </div>

      <p className="status">{status}</p>

      <p className="actions">
        <button type="button" onClick={() => void handleStart()} disabled={!hasBridge || recording}>
          Start
        </button>{' '}
        <button type="button" onClick={() => void handleStop()} disabled={!hasBridge || !recording}>
          Stop
        </button>
      </p>

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
        <p className="hint">Using input <code>{effectiveInput}</code> for the next start.</p>
      </section>

      <h2 className="log-heading">ffmpeg log</h2>
      <pre className="log">{log || '—'}</pre>
    </main>
  )
}
