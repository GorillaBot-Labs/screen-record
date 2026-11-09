# AGENTS.md

Screen Record: a macOS screen recorder (`apps/desktop`, Electron + Vite +
React, native ScreenCaptureKit helper in Swift) and a recordings gallery
(`apps/web`, Next.js 16 + React 19 + Tailwind 4 + Prisma/MongoDB) backed by
Google Cloud Storage. `README.md` has the layout, `PRODUCT.md` the users,
purpose and constraints. Read `apps/web/AGENTS.md` before changing the web
app: this Next.js version differs from what you may know.

npm workspaces, one lockfile at the root. Package names for `-w`:
`screen-record` (desktop) and `screen-record-web` (web).

## Fresh checkout

```bash
npm ci                                   # from the repo root; also runs prisma generate
cp apps/web/.env.test.example apps/web/.env.test   # for integration tests
```

Integration tests need a MongoDB replica set on `localhost:27018`
(`npm run test:db:up` starts one with Docker). They delete all data in their
database, so never point them at a real one.

## Dev server

Web, on a given port:

```bash
npm run dev -w screen-record-web -- --port <port>
```

It needs `apps/web/.env`. In a factory worktree, never copy the main
checkout's `.env`: it holds production database and storage credentials.
Create one that points at the local test Mongo instead:

```bash
cat > apps/web/.env <<'EOF'
DATABASE_URL="mongodb://localhost:27018/screen_record_dev_<job-id>?replicaSet=rs0&directConnection=true"
DESKTOP_INGEST_SECRET=dev-secret
APP_URL=http://localhost:<port>
GALLERY_EMAIL=dev@example.com
GALLERY_PASSWORD=dev-password
GALLERY_SESSION_SECRET=dev-session-secret-at-least-32-chars
EOF
```

Then run `cd apps/web && npx prisma db push --skip-generate` once. Without GCP
credentials, pages that list or play GCS objects will show empty or error
states; that's expected.

The desktop app (`npm run dev:desktop`) needs macOS, Swift and screen-recording
permission. Agents can't drive it; verify desktop changes with unit tests.

## Validation

`factory/checks.sh` runs all of these (it mirrors `.github/workflows/ci.yml`
plus the desktop typecheck):

```bash
npm run lint -w screen-record-web
npm run test:unit                 # web unit tests (apps/web/lib/**/*.test.ts)
npm run test:integration          # web integration tests, needs Mongo on 27018
npm run test:desktop              # desktop unit tests
(cd apps/desktop && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.node.json)
npm run build:web
```

Web unit tests sit next to the code as `apps/web/lib/*.test.ts`; integration
tests are in `apps/web/tests/integration/`. Desktop tests sit next to the code
in `apps/desktop/electron/` and `apps/desktop/src/`.

## Software factory

`/factory run` builds every open GitHub issue labeled `factory` through
intake → spec → build → gate → review → approve, one PR per issue. State is in
`factory/jobs/` (gitignored); `factory/bin/job` is its only writer. Checks:
`factory/checks.sh`. Dashboard: `cd factory && python3 -m http.server`, then
open http://localhost:8000/dashboard.html.

Each job works in its own git worktree, a full checkout of the repo at
`.worktrees/<job-id>` (gitignored). A tool run from the repo root that doesn't
read `.gitignore` sees those copies too; exclude `.worktrees/` in its config.
