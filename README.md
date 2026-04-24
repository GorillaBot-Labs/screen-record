# screen-record

macOS desktop app scaffold: **Electron**, **Vite**, **React**, and **TypeScript**. The UI runs in the renderer; native integration (for example ffmpeg recording) belongs in the main process and preload.

## Requirements

- Node.js 20+ (LTS recommended)
- npm

## Setup

```bash
npm install
```

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Vite and launch Electron against the dev server. |
| `npm run build` | Typecheck and produce production assets in `dist/` and `dist-electron/`. |
| `npm run start` | Run the packaged Electron entry after a build (same as `electron .`). |
| `npm run preview` | Vite preview of the web build only (no Electron). |

## Development notes

On macOS, Electron may ask for **Screen Recording** and **Microphone** when you add capture features; in development, permissions apply to the Electron binary you run, not only the final app name.
