# screen-record

macOS desktop app: **Electron**, **Vite**, **React**, and **TypeScript**. The UI runs in the renderer; screen and microphone capture run in the main process via the native **ScreenCaptureKit** helper (`sck-record`) and preload bridges IPC.

## Requirements

- Node.js 20+ (LTS recommended)
- npm
- **macOS 13+** with **Xcode / Swift** to build `native/sck-record` (the app does not use ffmpeg)

## Setup

```bash
npm install
```

## Scripts

| Command                | Description                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Builds `sck-record` when on macOS, then starts Vite + Electron.                                    |
| `npm run build`        | Builds `sck-record` on macOS, then typecheck + Vite production assets (`dist/`, `dist-electron/`). |
| `npm run start`        | Builds `sck-record` on macOS (`prestart`), then runs `electron .` (use after `npm run build`).     |
| `npm run preview`      | Vite preview of the web build only (no Electron).                                                  |
| `npm run build:native` | Only the Swift helper (`native/sck-record`); **skipped on non-macOS**.                             |
| `npm run build:mac`    | Full production build + packaged macOS app (`electron-builder`); output under `release/`.          |
| `npm run deploy`       | Same as `build:mac`, then installs the app to **Applications** (`scripts/deploy.sh`).              |
| `npm run install:mac`  | Alias for `deploy`.                                                                                |

## Development notes

This project is intended to run **locally** via `npm run dev` (or `npm run build` then `npm start`). On macOS, **Screen Recording** and **Microphone** apply to the Electron binary you run from that workflow.

Uploads go to the GCS bucket **`screen-record`** by default (set `GCS_BUCKET` if you need a different bucket). Credentials: `~/.screen-record/gcp-credentials.json` (see `electron/gcs-upload.ts`).

## Recording troubleshooting (sck-record)

Stderr from `sck-record` is forwarded into the in-app **Recorder log**.

- **Empty or broken MP4, no visible video** — macOS often reports display sizes with an **odd** height or width (for example 1728×1117). **H.264 / 4:2:0** needs even dimensions, and **VideoToolbox** is much happier with sizes rounded down to a **multiple of 16**. The helper aligns `SCStreamConfiguration` and the writer to the same encoded size; check the log for `sck-record: capture WxH (aligned from display …)`.

- **`video append failed` / encoder errors** — Usually means the **pixel buffer size** did not match what the writer expected, or the encoder rejected the format. The dimension alignment above is the usual fix; if it persists, confirm Screen Recording permission and that the chosen display index matches the refreshed device list.

- **Device indices** — Lists come from **`sck-record --list-json`** (ScreenCaptureKit + AVCapture order). Stored picks are revalidated when you refresh; if something looks wrong, hit refresh and reselect display and mic.
