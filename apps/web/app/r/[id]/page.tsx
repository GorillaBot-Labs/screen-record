import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const recording = await prisma.recording.findUnique({
    where: { id },
    select: {
      publicUrl: true,
      title: true,
      gcsObjectName: true,
      createdAt: true,
      notes: true,
    },
  });

  if (!recording) notFound();

  const title =
    recording.title?.trim() ||
    recording.gcsObjectName.split("/").pop() ||
    "Recording";

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {recording.notes?.trim() ? (
            <p className="text-sm text-stone-600 dark:text-zinc-400">{recording.notes.trim()}</p>
          ) : null}
        </header>

        <section className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm shadow-stone-900/5 dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
          <div className="aspect-video bg-zinc-950">
            <video
              className="h-full w-full object-contain"
              controls
              playsInline
              preload="metadata"
              src={recording.publicUrl}
            >
              Your browser does not support embedded video.
            </video>
          </div>
        </section>
      </main>
    </div>
  );
}

