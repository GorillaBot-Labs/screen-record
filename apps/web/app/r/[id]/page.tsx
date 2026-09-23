import { RecordingShareActions } from "@/app/r/[id]/RecordingShareActions";
import { RecordingViewer } from "@/app/r/[id]/RecordingViewer";
import { RecordingTags } from "@/app/components/RecordingTags";
import {
  displayTitle,
  recordingDateLongFormatter,
} from "@/lib/recording-display";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { title: true, gcsObjectName: true },
  });
  if (!recording) return { title: "Recording not found" };
  return {
    title: displayTitle(recording),
    description: "Screen recording",
  };
}

function parseStartTime(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export default async function RecordingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const startAtSeconds = parseStartTime(t);

  const recording = await prisma.recording.findUnique({
    where: { id },
    select: {
      publicUrl: true,
      title: true,
      gcsObjectName: true,
      createdAt: true,
      notes: true,
      tags: true,
      comments: {
        orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          body: true,
          timestampSeconds: true,
          createdAt: true,
        },
      },
    },
  });

  if (!recording) notFound();

  const title = displayTitle(recording);
  const shareUrl = `/r/${id}`;
  const initialComments = recording.comments.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <main className="flex min-h-full flex-1 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-6 py-4 md:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <Link href="/" className="transition-colors hover:text-accent">
            Library
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          <span className="truncate text-foreground">{title}</span>
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            <time
              className="mt-1 block text-sm text-muted"
              dateTime={recording.createdAt.toISOString()}
            >
              {recordingDateLongFormatter.format(recording.createdAt)}
            </time>
            {recording.notes?.trim() ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {recording.notes.trim()}
              </p>
            ) : null}
            <RecordingTags recordingId={id} tags={recording.tags ?? []} />
          </div>
          <RecordingShareActions shareUrl={shareUrl} publicUrl={recording.publicUrl} />
        </div>
      </div>

      <RecordingViewer
        recordingId={id}
        publicUrl={recording.publicUrl}
        initialComments={initialComments}
        startAtSeconds={startAtSeconds}
      />
    </main>
  );
}
