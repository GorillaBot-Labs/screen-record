import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Pause, Play, RotateCcw, Square, X } from 'lucide-react'

import { formatRecordingElapsed } from '../electron/format-recording-elapsed'

import './overlay-base.css'
import './recording-overlay.css'

function RecordingOverlayApp() {
  const api = window.electronAPI?.recordingOverlay
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [dragging, setDragging] = useState(false)
  const lastTickMsRef = useRef<number | null>(null)
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)

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

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.recording-overlay-actions')) return
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.screenX,
      lastY: event.screenY,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId || !api?.moveBy) return
      const deltaX = event.screenX - drag.lastX
      const deltaY = event.screenY - drag.lastY
      if (deltaX === 0 && deltaY === 0) return
      drag.lastX = event.screenX
      drag.lastY = event.screenY
      void api.moveBy(deltaX, deltaY)
    },
    [api],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

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
        console.warn('Resume failed', res)
      }
    } else {
      const res = await api.pause?.()
      if (res?.ok) {
        setPaused(true)
      } else {
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
    return (
      <div className="recording-overlay-shell" aria-hidden>
        <div className="recording-overlay" />
      </div>
    )
  }

  return (
    <div className="recording-overlay-shell">
      <div
        className={
          dragging ? 'recording-overlay recording-overlay--dragging' : 'recording-overlay'
        }
        role="toolbar"
        aria-label="Recording controls"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="recording-overlay-status">
          <div className="recording-overlay-dot" aria-hidden />
          <time className="recording-overlay-time" aria-live="polite">
            {formatRecordingElapsed(elapsed)}
          </time>
        </div>

        <div className="recording-overlay-divider" aria-hidden />

        <div className="recording-overlay-actions">
          <button
            type="button"
            className="recording-overlay-btn"
            onClick={handleTogglePause}
            aria-label={paused ? 'Resume recording' : 'Pause recording'}
          >
            {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
          </button>

          <button
            type="button"
            className="recording-overlay-btn recording-overlay-btn--stop"
            onClick={handleStop}
            aria-label="Stop recording"
          >
            <Square size={14} fill="currentColor" aria-hidden />
          </button>

          <button
            type="button"
            className="recording-overlay-btn"
            onClick={handleRestart}
            aria-label="Restart recording"
          >
            <RotateCcw size={16} aria-hidden />
          </button>

          <button
            type="button"
            className="recording-overlay-btn recording-overlay-btn--cancel"
            onClick={handleCancel}
            aria-label="Cancel recording"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<RecordingOverlayApp />)
