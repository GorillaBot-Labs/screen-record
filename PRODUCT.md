# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Monorepo: **Electron + Vite + React** desktop (`apps/desktop`), **Next.js 16 + React 19 + Tailwind 4 + Prisma/MongoDB** web gallery (`apps/web`). Video storage on **Google Cloud Storage**; web deployed to **Vercel**.

## Users

**Recorder** — runs the macOS desktop app, captures screen + microphone, uploads MP4, receives a share link.

**Gallery operator** — browses the web gallery, copies links, deletes entries.

**Viewer** — anyone with a `/r/[id]` link; no account required.

## Product Purpose

Screen Record is a personal/internal toolchain for capturing macOS screen recordings, storing them in GCS, and sharing them through a lightweight web gallery. Success means a recorder can finish a capture and hand someone a watchable link in seconds, and operators can find, share, or remove recordings without touching the bucket directly.

## Positioning

Native **ScreenCaptureKit** capture on macOS (no ffmpeg), a menu-bar-first recording workflow, and a catalog-backed share page (`/r/id`) rather than raw GCS URLs — integrated record → upload → link in one toolchain, not a generic file dump.

## Operating Context

- Desktop runs locally or as a packaged `.app` on **macOS 13+**.
- Web gallery is open — no login gate; share pages and library are publicly reachable when deployed.
- Desktop posts to `/api/recordings/ingest` after upload when `WEB_APP_BASE_URL` and `DESKTOP_INGEST_SECRET` are configured.
- GCP credentials: `~/.screen-record/gcp-credentials.json` (desktop) or env on web.

## Capabilities and Constraints

**Desktop:** display/mic selection, countdown, tray control, pause/resume/stop, H.264 MP4 via VideoToolbox, GCS upload, clipboard + optional browser open for share URL.

**Web gallery:** grid library with search/sort/tags, projects and folders, public detail pages with embedded player, editable title/description, viewer analytics, download + embed, timestamped anonymous comments, copy share link, delete (GCS + Mongo), no per-user accounts or RBAC.

**Data:** Mongo catalogs GCS objects. Recording fields include `title`, `notes`, `tags`, `durationSeconds`, `viewCount`, `lastViewedAt`, optional `projectId` / `folderId`. Projects contain folders (nested) and recordings.

**Constraints:** macOS-only capture today; public GCS object URLs.

## Deferred (documented, not built)

- **Video thumbnails** — poster frames for library cards and richer link previews without generating OG images from title text alone.
- **Transcripts / captions** — speech-to-text for search and player captions.
- **Basic trim** — set in/out points on web without re-recording.

## Brand Commitments

- Product name: **Screen Record** (desktop), **Recordings** (web UI title).
- Web visual direction (user-specified): **Loom-inspired** SaaS video library — left sidebar navigation, light workspace chrome, video-first grid and detail pages. Familiar async-video UX without copying Loom branding literally.

## Evidence on Hand

- Working desktop app and web gallery in this repository.
- Real recordings stored in GCS with Mongo catalog.
- No marketing site, testimonials, pricing, or multi-tenant features — do not invent them.

## Product Principles

1. **Link-first sharing** — prefer `/r/id` pages over raw bucket URLs.
2. **Recorder speed** — minimize steps from stop to copied link.
3. **Open gallery** — library and share pages are public; access control is not implemented yet.
4. **Catalog honesty** — the gallery reflects recordings uploaded and cataloged through the app.
5. **Native where it matters** — macOS capture quality over cross-platform breadth for now.

## Accessibility & Inclusion

- Keyboard-accessible controls on gallery cards and auth forms.
- Video players use native `<video controls>` for built-in accessibility.
- No product-specific WCAG certification established; target sensible contrast and focus visibility on web surfaces.
