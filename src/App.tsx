import { useState } from 'react'

export default function App() {
  const [ping] = useState(() => {
    const api = window.electronAPI
    return api?.ping?.() ?? '(no preload)'
  })

  return (
    <main>
      <h1>Screen Record</h1>
      <p className="muted">Vite + React + TypeScript + Electron</p>
      <p>
        Preload bridge: <code>{ping}</code>
      </p>
    </main>
  )
}
