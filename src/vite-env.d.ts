/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI?: {
      ping: () => string
    }
  }
}

export {}
