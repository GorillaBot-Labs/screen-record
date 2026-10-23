import {
  assertRecordingsMp4Key,
  getGcsBucketName,
  getStorage,
} from "@/lib/gcs";
import { prisma } from "@/lib/prisma";
import {
  contentDispositionAttachment,
  recordingDownloadFilename,
} from "@/lib/recording-download";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { gcsObjectName: true },
  });
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  try {
    assertRecordingsMp4Key(recording.gcsObjectName);
  } catch {
    return NextResponse.json({ error: "Invalid recording file" }, { status: 400 });
  }

  const file = getStorage().bucket(getGcsBucketName()).file(recording.gcsObjectName);
  const [exists] = await file.exists();
  if (!exists) {
    return NextResponse.json({ error: "Recording file not found" }, { status: 404 });
  }

  const filename = recordingDownloadFilename(recording.gcsObjectName, id);
  const [metadata] = await file.getMetadata();
  const contentLength = metadata.size;

  const nodeStream = file.createReadStream();
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Disposition": contentDispositionAttachment(filename),
    "Cache-Control": "private, no-cache",
  };
  if (contentLength !== undefined && contentLength !== null) {
    headers["Content-Length"] = String(contentLength);
  }

  return new Response(body, { headers });
}
