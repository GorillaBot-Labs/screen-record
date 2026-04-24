import { prisma } from "@/lib/prisma";
import { GallerySignOut } from "./components/GallerySignOut";
import { RecordingCard } from "./components/RecordingCard";

export const dynamic = "force-dynamic";

const hasGalleryAuth = Boolean(process.env.INTERNAL_GALLERY_SECRET?.trim());

async function loadRecordings() {
  try {
    const recordings = await prisma.recording.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { ok: true as const, recordings };
  } catch (err) {
    console.error(err);
    return { ok: false as const };
  }
}

export default async function Home() {
  const result = await loadRecordings();

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-zinc-50">
              Recordings
            </h1>
            {hasGalleryAuth ? <GallerySignOut /> : null}
          </div>
          <p className="max-w-2xl text-sm text-stone-600 dark:text-zinc-400">
            Internal gallery. Videos stream from stored public URLs; run reconcile to sync the catalog from
            GCS.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {!result.ok ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            <p className="font-medium">Could not load recordings</p>
            <p className="mt-1 text-red-800/90 dark:text-red-300/90">
              Check <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs dark:bg-red-900/60">DATABASE_URL</code>{" "}
              and that Prisma can reach MongoDB, then refresh.
            </p>
          </div>
        ) : result.recordings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-base font-medium text-stone-800 dark:text-zinc-200">No recordings yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-zinc-400">
              Run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">npm run reconcile -w screen-record-web</code>{" "}
              from the repo root (with GCS and DB env set) to backfill from your bucket.
            </p>
          </div>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.recordings.map((recording) => (
              <li key={recording.id}>
                <RecordingCard recording={recording} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
