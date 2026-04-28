import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Pause, Play, RotateCcw, Square, X } from 'lucide-react'

import './index.css'
import './recording-overlay.css'

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function RecordingOverlayApp() {
  const api = window.electronAPI?.recordingOverlay
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const lastTickMsRef = useRef<number | null>(null)

  useEffect(() => {
    if (!api?.pullInitial) return
    void api.pullInitial().then((initial) => {
      if (typeof initial === 'number') setStartedAtMs(initial)
    })
  }, [api])

  useEffect(() => {
    if (startedAtMs == null) return
    const now = Date.now()
    lastTickMsRef.current = now
    setElapsedMs(Math.max(0, now - startedAtMs))
    return undefined
  }, [startedAtMs])

  useEffect(() => {
    if (startedAtMs == null) return
    if (paused) return
    const id = window.setInterval(() => {
      const now = Date.now()
      const last = lastTickMsRef.current ?? now
      lastTickMsRef.current = now
      setElapsedMs((prev) => Math.max(0, prev + (now - last)))
    }, 250)
    return () => window.clearInterval(id)
  }, [paused, startedAtMs])

  const elapsed = useMemo(() => {
    if (startedAtMs == null) return null
    return elapsedMs
  }, [elapsedMs, startedAtMs])

  async function handleStop() {
    await api?.stop?.()
  }

  async function handleTogglePause() {
    if (!api) return
    if (paused) {
      const res = await api.resume?.()
      if (res?.ok) {
        lastTickMsRef.current = Date.now()
        setPaused(false)
      } else {
        // eslint-disable-next-line no-console
        console.warn('Resume failed', res)
      }
    } else {
      const res = await api.pause?.()
      if (res?.ok) {
        setPaused(true)
      } else {
        // eslint-disable-next-line no-console
        console.warn('Pause failed', res)
      }
    }
  }

  async function handleRestart() {
    await api?.restart?.()
  }

  async function handleCancel() {
    await api?.cancel?.()
  }

  if (startedAtMs == null || elapsed == null) {
    return <div className="recording-overlay" aria-hidden />
  }

  return (
    <div className="recording-overlay" role="dialog" aria-modal="false" aria-label="Recording status">
      <div className="recording-overlay-left">
        <div className="recording-overlay-dot" aria-hidden />
        <div className="recording-overlay-meta">
          <div className="recording-overlay-title">Recording</div>
          <div className="recording-overlay-time" aria-live="polite">
            {formatElapsed(elapsed)}
          </div>
        </div>
      </div>

      <div className="recording-overlay-actions" role="group" aria-label="Recording controls">
        <button
          type="button"
          className="recording-overlay-btn"
          onClick={handleTogglePause}
          aria-label={paused ? 'Resume recording' : 'Pause recording'}
        >
          {paused ? <Play size={22} aria-hidden /> : <Pause size={22} aria-hidden />}
        </button>

        <button
          type="button"
          className="recording-overlay-btn recording-overlay-btn--stop"
          onClick={handleStop}
          aria-label="Stop recording"
        >
          <Square size={22} aria-hidden />
        </button>

        <button type="button" className="recording-overlay-btn" onClick={handleRestart} aria-label="Restart recording">
          <RotateCcw size={22} aria-hidden />
        </button>

        <button
          type="button"
          className="recording-overlay-btn recording-overlay-btn--cancel"
          onClick={handleCancel}
          aria-label="Cancel recording"
        >
          <X size={22} aria-hidden />
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<RecordingOverlayApp />)

