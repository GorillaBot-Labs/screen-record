import { prisma } from "@/lib/prisma";

const lastViewedFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatViewStats(recording: {
  viewCount: number;
  lastViewedAt: Date | null;
}): string {
  if (recording.viewCount <= 0) return "No views yet";
  const views = recording.viewCount === 1 ? "1 view" : `${recording.viewCount} views`;
  if (!recording.lastViewedAt) return views;
  return `${views} · Last watched ${lastViewedFormatter.format(recording.lastViewedAt)}`;
}

export type RecordViewResult =
  | { ok: true; viewCount: number; firstView: boolean }
  | { ok: false; error: string };

export async function recordViewInCatalog(recordingId: string): Promise<RecordViewResult> {
  if (!recordingId?.trim()) {
    return { ok: false, error: "Missing recording id" };
  }

  try {
    const existing = await prisma.recording.findUnique({
      where: { id: recordingId },
      select: { viewCount: true },
    });
    if (!existing) return { ok: false, error: "Recording not found" };

    const firstView = existing.viewCount === 0;
    const now = new Date();
    const recording = await prisma.recording.update({
      where: { id: recordingId },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: now,
      },
      select: { viewCount: true },
    });

    return { ok: true, viewCount: recording.viewCount, firstView };
  } catch {
    return { ok: false, error: "Could not record view" };
  }
}
