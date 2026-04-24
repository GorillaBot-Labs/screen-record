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
| `npm run build:mac` | Optional packaged macOS app (`electron-builder`); output is under `release/`. |

## Development notes

This project is intended to run **locally** via `npm run dev` (or `npm run start` after a build). On macOS, **Screen Recording** and **Microphone** apply to the Electron binary you run from that workflow.

Uploads go to the GCS bucket **`screen-record`** by default (set `GCS_BUCKET` if you need a different bucket). Credentials: `~/.screen-record/gcp-credentials.json` (see `electron/gcs-upload.ts`).
