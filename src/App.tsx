import { useEffect, useRef, useState } from 'react'

export default function App() {
  const [ffmpegInfo, setFfmpegInfo] = useState<string>('…')
  const [log, setLog] = useState<string>('')
  const [status, setStatus] = useState<string>('Idle')
  const logRef = useRef<string>('')

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
      setStatus(`Ended (code=${code}, signal=${signal ?? 'none'})`)
    })

    return () => {
      offStderr()
      offEnded()
    }
  }, [])

  async function handleStart() {
    const api = window.electronAPI
    if (!api) return
    logRef.current = ''
    setLog('')
    setStatus('Starting…')
    const res = await api.startRecording()
    if (res.ok) {
      setStatus(`Recording → ${res.outputPath}`)
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

  return (
    <main>
      <h1>Screen Record</h1>
      <p className="muted">ffmpeg: {ffmpegInfo}</p>
      <p>{status}</p>
      <p>
        <button type="button" onClick={() => void handleStart()}>
          Start
        </button>{' '}
        <button type="button" onClick={() => void handleStop()}>
          Stop
        </button>
      </p>
      <pre className="log">{log || '—'}</pre>
    </main>
  )
}
