import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import './overlay.css'

function OverlayApp() {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    const overlay = window.electronAPI?.overlay
    if (!overlay?.onCountdown || !overlay.pullInitialCountdown) return

    let off: (() => void) | undefined

    void overlay.pullInitialCountdown().then((initial) => {
      if (typeof initial === 'number') setValue(initial)
      off = overlay.onCountdown((n) => setValue(n))
    })

    return () => {
      off?.()
    }
  }, [])

  if (value === null) {
    return <div className="countdown-overlay" aria-hidden />
  }

  function handleSkip() {
    window.electronAPI?.overlay?.requestSkip?.()
  }

  return (
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
        key={value}
        className="countdown-overlay-digit"
        aria-live="assertive"
      >
        {value}
      </p>
      <button type="button" className="countdown-overlay-skip" onClick={handleSkip}>
        Skip — start now
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OverlayApp />)
