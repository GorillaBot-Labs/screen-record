import { PublicWatchBar } from "@/app/(watch)/r/[id]/PublicWatchBar";
import { RecordingShareActions } from "@/app/(watch)/r/[id]/RecordingShareActions";
import { RecordingViewer } from "@/app/(watch)/r/[id]/RecordingViewer";
import { RecordingViewTracker } from "@/app/components/RecordingViewTracker";
import { appBaseUrl } from "@/lib/app-url";
import { recordingDownloadFilename } from "@/lib/recording-download";
import { displayTitle, recordingDateLongFormatter } from "@/lib/recording-display";
import { buildRecordingOpenGraph } from "@/lib/recording-open-graph";
import { isGallerySignedIn } from "@/lib/gallery-auth";
import { galleryOperatorEmail } from "@/lib/gallery-session";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { title: true, gcsObjectName: true, notes: true, publicUrl: true, posterUrl: true },
  });
  if (!recording) return { title: "Recording not found" };

  const title = displayTitle(recording);
  const og = buildRecordingOpenGraph({
    recordingId: id,
    title,
    notes: recording.notes,
    appBaseUrl: appBaseUrl(),
    publicUrl: recording.publicUrl,
    posterUrl: recording.posterUrl,
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
      videos: og.videos,
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

export default async function PublicRecordingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const startAtSeconds = parseStartTime(t);

  const [recording, signedIn] = await Promise.all([
    prisma.recording.findUnique({
      where: { id },
      select: {
        publicUrl: true,
        posterUrl: true,
        title: true,
        gcsObjectName: true,
        createdAt: true,
        notes: true,
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
    isGallerySignedIn(),
  ]);

  if (!recording) notFound();

  const title = displayTitle(recording);
  const shareUrl = `${appBaseUrl()}/r/${id}`;
  const downloadFilename = recordingDownloadFilename(recording.gcsObjectName, id);
  const initialComments = recording.comments.map((comment) => ({
    ...comment,
    createdAt: comment.createdAt.toISOString(),
  }));

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-background">
      <PublicWatchBar
        signedIn={signedIn}
        recordingId={id}
        accountEmail={signedIn ? galleryOperatorEmail() : null}
      />
      <RecordingViewTracker recordingId={id} />
      <header className="shrink-0 border-b border-border px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            {recording.notes?.trim() ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {recording.notes.trim()}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-muted">
              <time dateTime={recording.createdAt.toISOString()}>
                {recordingDateLongFormatter.format(recording.createdAt)}
              </time>
            </p>
          </div>
          <RecordingShareActions
            recordingId={id}
            shareUrl={shareUrl}
            publicUrl={recording.publicUrl}
            downloadFilename={downloadFilename}
            variant="watch"
            compact
          />
        </div>
      </header>
      <RecordingViewer
        recordingId={id}
        publicUrl={recording.publicUrl}
        posterUrl={recording.posterUrl}
        initialComments={initialComments}
        startAtSeconds={startAtSeconds}
      />
    </main>
  );
}
