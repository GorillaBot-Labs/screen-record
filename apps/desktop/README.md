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

### Daily workflow (no reinstall)

Use dev mode while iterating. You only need `npm run install:mac` when you want a packaged app in `/Applications` (testing the real `.app`, sharing a build, etc.).

**Terminal 1 — web gallery (needed for ingest + browser open after upload):**

```bash
npm run dev:web
```

**Terminal 2 — desktop recorder:**

```bash
npm run dev:desktop
```

What reloads automatically:

| Change | Reload |
|--------|--------|
| React UI (`src/`, CSS) | Hot reload — instant |
| Electron main/preload (`electron/`) | Vite restarts Electron — a few seconds |
| Env (`.env` or `.env.production`) | Quit and restart the app |
| Native recorder (`native/sck-record`) | Restart `dev:desktop` (rebuilds Swift on start) |

Dev loads `apps/desktop/.env` (copy from `.env.example`). Set `WEB_APP_BASE_URL=http://localhost:3000` and the same `DESKTOP_INGEST_SECRET` as `apps/web/.env`.

macOS **Screen Recording** and **Microphone** permissions apply to the **Electron dev binary**, not the installed `Screen Record.app`. Grant them to Electron when prompted during `dev:desktop`.

### Packaging (occasionally)

1. Copy `.env.production.example` → `apps/desktop/.env.production` with your **deployed** gallery URL (not localhost).
2. Run:

```bash
npm run install:mac
```

The production env file is bundled into `Screen Record.app`. Optional override: `~/.screen-record/.env`.

### Uploads and share links

When `WEB_APP_BASE_URL` and `DESKTOP_INGEST_SECRET` are set, finishing a recording uploads the file and **opens the recording page in your browser**. The tray menu still offers “Copy last share link”.

| Mode | Env file |
|------|----------|
| `npm run dev:desktop` | `apps/desktop/.env` |
| Installed `.app` | `apps/desktop/.env.production` (bundled at build) |

Both need the same `DESKTOP_INGEST_SECRET` as the web app.

## Recording troubleshooting (sck-record)

Stderr from `sck-record` is forwarded into the in-app **Recorder log**.

- **Empty or broken MP4, no visible video** — macOS often reports display sizes with an **odd** height or width (for example 1728×1117). **H.264 / 4:2:0** needs even dimensions, and **VideoToolbox** is much happier with sizes rounded down to a **multiple of 16**. The helper aligns `SCStreamConfiguration` and the writer to the same encoded size; check the log for `sck-record: capture WxH (aligned from display …)`.

- **`video append failed` / encoder errors** — Usually means the **pixel buffer size** did not match what the writer expected, or the encoder rejected the format. The dimension alignment above is the usual fix; if it persists, confirm Screen Recording permission and that the chosen display index matches the refreshed device list.

- **Device indices** — Lists come from **`sck-record --list-json`** (ScreenCaptureKit + AVCapture order). Stored picks are revalidated when you refresh; if something looks wrong, hit refresh and reselect display and mic.
