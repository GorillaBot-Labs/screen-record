import { RecordingShareActions } from "@/app/r/[id]/RecordingShareActions";
import { RecordingViewer } from "@/app/r/[id]/RecordingViewer";
import { RecordingLocationPicker } from "@/app/components/RecordingLocationPicker";
import { RecordingMetadataEditor } from "@/app/components/RecordingMetadataEditor";
import { RecordingTags } from "@/app/components/RecordingTags";
import { RecordingViewTracker } from "@/app/components/RecordingViewTracker";
import { appBaseUrl } from "@/lib/app-url";
import {
  displayTitle,
  recordingDateLongFormatter,
} from "@/lib/recording-display";
import { formatViewStats } from "@/lib/recording-analytics";
import { buildRecordingOpenGraph } from "@/lib/recording-open-graph";
import { loadProjectTree } from "@/lib/projects";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { title: true, gcsObjectName: true, notes: true },
  });
  if (!recording) return { title: "Recording not found" };

  const title = displayTitle(recording);
  const og = buildRecordingOpenGraph({
    recordingId: id,
    title,
    notes: recording.notes,
    appBaseUrl: appBaseUrl(),
  });

  return {
    title,
    description: og.description,
    openGraph: {
      title: og.title,
      description: og.description,
      url: og.url,
      type: "video.other",
      images: og.images,
    },
    twitter: {
      card: "summary_large_image",
      title: og.title,
      description: og.description,
      images: og.images.map((image) => image.url),
    },
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

  const [recording, projectTree] = await Promise.all([
    prisma.recording.findUnique({
      where: { id },
      select: {
        publicUrl: true,
        title: true,
        gcsObjectName: true,
        createdAt: true,
        notes: true,
        tags: true,
        viewCount: true,
        lastViewedAt: true,
        projectId: true,
        folderId: true,
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
    }),
    loadProjectTree(),
  ]);

  if (!recording) notFound();

  const shareUrl = `/r/${id}`;
  const downloadFilename =
    recording.gcsObjectName.split("/").pop() ?? `recording-${id}.mp4`;
  const initialComments = recording.comments.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }));

  const viewStats = formatViewStats({
    viewCount: recording.viewCount,
    lastViewedAt: recording.lastViewedAt,
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background">
      <RecordingViewTracker recordingId={id} />
      <header className="shrink-0 border-b border-border px-6 py-3 md:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Library
        </Link>

        <div className="mt-2.5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 space-y-2">
            <RecordingMetadataEditor
              recordingId={id}
              title={recording.title}
              gcsObjectName={recording.gcsObjectName}
              notes={recording.notes}
            />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0 text-sm text-muted">
              <time dateTime={recording.createdAt.toISOString()}>
                {recordingDateLongFormatter.format(recording.createdAt)}
              </time>
              <span aria-hidden className="text-border">
                ·
              </span>
              <span>{viewStats}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <RecordingTags recordingId={id} tags={recording.tags ?? []} compact />
              <RecordingLocationPicker
                recordingId={id}
                projectTree={projectTree}
                projectId={recording.projectId}
                folderId={recording.folderId}
                compact
              />
            </div>
          </div>
          <RecordingShareActions
            shareUrl={shareUrl}
            publicUrl={recording.publicUrl}
            downloadFilename={downloadFilename}
            compact
          />
        </div>
      </header>

      <RecordingViewer
        recordingId={id}
        publicUrl={recording.publicUrl}
        initialComments={initialComments}
        startAtSeconds={startAtSeconds}
      />
    </main>
  );
}
