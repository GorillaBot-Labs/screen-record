import { NextResponse } from "next/server";
import { recordViewInCatalog } from "@/lib/recording-analytics";
import { prisma } from "@/lib/prisma";
import { sendViewNotification } from "@/lib/send-view-notification";
import { displayTitle } from "@/lib/recording-display";
import { buildRecordingShareUrl } from "@/lib/share-links";
import { appBaseUrl } from "@/lib/app-url";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await recordViewInCatalog(id);
  if (!result.ok) {
    const status = result.error === "Recording not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  if (result.firstView) {
    const recording = await prisma.recording.findUnique({
      where: { id },
      select: { title: true, gcsObjectName: true, publicUrl: true },
    });
    if (recording) {
      void sendViewNotification({
        recordingTitle: displayTitle(recording),
        recordingPageUrl: buildRecordingShareUrl(id, appBaseUrl()),
        videoUrl: recording.publicUrl,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    viewCount: result.viewCount,
    firstView: result.firstView,
  });
}
