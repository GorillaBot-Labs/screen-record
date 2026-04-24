# screen-record

macOS desktop app: **Electron**, **Vite**, **React**, and **TypeScript**. The UI runs in the renderer; screen and microphone capture run in the main process via the native **ScreenCaptureKit** helper (`sck-record`) and preload bridges IPC.

## Requirements

- Node.js 20+ (LTS recommended)
- npm
- **macOS 13+** with **Xcode / Swift** to build `native/sck-record` (the app does not use ffmpeg)

## Setup

```bash
npm install
npm run build:native
```

`build:native` produces `native/sck-record/.build/release/sck-record`, which **must** exist for dev (`npm run dev`) and is bundled into packaged apps (`npm run build:mac`).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Vite and launch Electron against the dev server. |
| `npm run build` | Typecheck and produce production assets in `dist/` and `dist-electron/`. |
| `npm run start` | Run the packaged Electron entry after a build (same as `electron .`). |
| `npm run preview` | Vite preview of the web build only (no Electron). |
| `npm run build:native` | Build the `sck-record` binary (`swift build -c release` under `native/sck-record`). |
| `npm run build:mac` | Production web/electron build, native helper, then packaged macOS app (`electron-builder`); output under `release/`. |

## Development notes

This project is intended to run **locally** via `npm run dev` (or `npm run start` after a build). On macOS, **Screen Recording** and **Microphone** apply to the Electron binary you run from that workflow.

Uploads go to the GCS bucket **`screen-record`** by default (set `GCS_BUCKET` if you need a different bucket). Credentials: `~/.screen-record/gcp-credentials.json` (see `electron/gcs-upload.ts`).

## Recording troubleshooting (sck-record)

Stderr from `sck-record` is forwarded into the in-app **Recorder log**.

- **Empty or broken MP4, no visible video** — macOS often reports display sizes with an **odd** height or width (for example 1728×1117). **H.264 / 4:2:0** needs even dimensions, and **VideoToolbox** is much happier with sizes rounded down to a **multiple of 16**. The helper aligns `SCStreamConfiguration` and the writer to the same encoded size; check the log for `sck-record: capture WxH (aligned from display …)`.

- **`video append failed` / encoder errors** — Usually means the **pixel buffer size** did not match what the writer expected, or the encoder rejected the format. The dimension alignment above is the usual fix; if it persists, confirm Screen Recording permission and that the chosen display index matches the refreshed device list.

- **Device indices** — Lists come from **`sck-record --list-json`** (ScreenCaptureKit + AVCapture order). Stored picks are revalidated when you refresh; if something looks wrong, hit refresh and reselect display and mic.
