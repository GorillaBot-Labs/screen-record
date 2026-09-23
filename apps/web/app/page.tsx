import { RecordingCard } from "@/app/components/RecordingCard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
  const count = result.ok ? result.recordings.length : 0;

  return (
    <main className="flex min-h-full flex-1 flex-col bg-background">
      <div className="border-b border-border px-6 py-6 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Videos</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Screen recordings from your desktop app. Click any video to watch or share.
            </p>
          </div>
          {result.ok && count > 0 ? (
            <p className="text-sm font-medium text-muted">
              {count} video{count === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex-1 px-6 py-6 md:px-8">
        {!result.ok ? (
          <div
            className="rounded-xl border border-red-200 bg-danger-soft px-5 py-6 text-sm text-red-900"
            role="alert"
          >
            <p className="font-medium">Could not load recordings</p>
            <p className="mt-1 text-red-800/90">
              Check{" "}
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs">DATABASE_URL</code>{" "}
              and that Prisma can reach MongoDB, then refresh.
            </p>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-20 text-center">
            <p className="text-base font-medium text-foreground">No recordings yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Record from the desktop app, or run{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-foreground">
                npm run reconcile -w screen-record-web
              </code>{" "}
              to backfill from your bucket.
            </p>
          </div>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {result.recordings.map((recording) => (
              <li key={recording.id}>
                <RecordingCard recording={recording} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
