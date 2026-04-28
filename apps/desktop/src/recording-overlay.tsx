import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Square } from 'lucide-react'

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
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!api?.pullInitial) return
    void api.pullInitial().then((initial) => {
      if (typeof initial === 'number') setStartedAtMs(initial)
    })
  }, [api])

  useEffect(() => {
    if (startedAtMs == null) return
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [startedAtMs])

  const elapsed = useMemo(() => {
    if (startedAtMs == null) return null
    return Math.max(0, nowMs - startedAtMs)
  }, [nowMs, startedAtMs])

  async function handleStop() {
    await api?.stop?.()
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

      <button type="button" className="recording-overlay-stop" onClick={handleStop}>
        <Square size={16} aria-hidden />
        <span>Stop</span>
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<RecordingOverlayApp />)

