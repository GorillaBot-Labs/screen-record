import { LibraryView } from "@/app/components/LibraryView";
import type { LibraryRecording } from "@/lib/library-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadRecordings() {
  try {
    const recordings = await prisma.recording.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { comments: true } },
      },
    });
    return { ok: true as const, recordings };
  } catch (err) {
    console.error(err);
    return { ok: false as const };
  }
}

function toLibraryRecording(recording: {
  id: string;
  title: string | null;
  gcsObjectName: string;
  publicUrl: string;
  createdAt: Date;
  notes: string | null;
  tags: string[];
  durationSeconds: number | null;
  _count: { comments: number };
}): LibraryRecording {
  return {
    id: recording.id,
    title: recording.title,
    gcsObjectName: recording.gcsObjectName,
    publicUrl: recording.publicUrl,
    createdAt: recording.createdAt.toISOString(),
    notes: recording.notes,
    tags: recording.tags ?? [],
    durationSeconds: recording.durationSeconds,
    commentCount: recording._count.comments,
  };
}

export default async function Home() {
  const result = await loadRecordings();

  return (
    <main className="flex min-h-full flex-1 flex-col bg-background">
      <div className="border-b border-border px-6 py-6 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Videos</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Search, tag, sort, and manage your screen recordings.
        </p>
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
        ) : (
          <LibraryView recordings={result.recordings.map(toLibraryRecording)} />
        )}
      </div>
    </main>
  );
}
