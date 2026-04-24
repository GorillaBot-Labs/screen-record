# screen-record

Monorepo for a **macOS screen recorder** (Electron) and an internal **recordings gallery** (Next.js) backed by **Google Cloud Storage** and **MongoDB** (Prisma).

## Layout

| Path | Description |
|------|-------------|
| `apps/desktop` | Electron + Vite app; captures video and uploads to GCS. |
| `apps/web` | Next.js gallery: lists recordings, playback, copy link, delete (GCS + DB). |

Install once from the **repository root** (single lockfile, npm workspaces):

```bash
npm install
```

## Scripts (root)

```bash
npm run dev:desktop    # desktop app dev (builds native helper first)
npm run dev:web        # Next.js dev server

npm run build:desktop
npm run build:web

npm run db:generate    # Prisma client for the web app
```

## Web app

- **Env:** copy `apps/web/.env.example` to `apps/web/.env` and set `DATABASE_URL`, `GCS_BUCKET`, and GCP credentials (`GCP_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`). See the example file for notes.
- **Backfill catalog from GCS:** `npm run reconcile -w screen-record-web` (same env as above).
- **Deploy (e.g. Vercel):** set the same env vars on the project; if the Vercel **Root Directory** is `apps/web`, configure it there.

Package names for `-w` are `screen-record` (desktop) and `screen-record-web` (web).

## Desktop app

See `apps/desktop/README.md` for native build requirements and packaging.
