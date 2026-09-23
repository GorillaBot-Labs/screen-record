import { appBaseUrl } from "@/lib/app-url";
import { commentNotificationFromRecording } from "@/lib/emails/comment-notification";
import { prisma } from "@/lib/prisma";
import { sendCommentNotification } from "@/lib/send-comment-notification";
import { NextResponse } from "next/server";

const MAX_BODY_LENGTH = 2000;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!recording) {
    return NextResponse.json({ ok: false, error: "Recording not found" }, { status: 404 });
  }

  const comments = await prisma.recordingComment.findMany({
    where: { recordingId: id },
    orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      body: true,
      timestampSeconds: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, comments });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { id: true, title: true, gcsObjectName: true, publicUrl: true },
  });
  if (!recording) {
    return NextResponse.json({ ok: false, error: "Recording not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text =
    typeof body === "object" && body !== null && "body" in body
      ? String((body as { body: unknown }).body).trim()
      : "";
  const timestampSeconds =
    typeof body === "object" && body !== null && "timestampSeconds" in body
      ? Number((body as { timestampSeconds: unknown }).timestampSeconds)
      : NaN;

  if (!text) {
    return NextResponse.json({ ok: false, error: "Comment cannot be empty" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Comment must be ${MAX_BODY_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    return NextResponse.json({ ok: false, error: "Invalid timestamp" }, { status: 400 });
  }

  const comment = await prisma.recordingComment.create({
    data: {
      recordingId: id,
      body: text,
      timestampSeconds,
    },
    select: {
      id: true,
      body: true,
      timestampSeconds: true,
      createdAt: true,
    },
  });

  void sendCommentNotification(
    commentNotificationFromRecording(recording, comment, appBaseUrl()),
  ).then((result) => {
    if (!result.ok) {
      console.error("Comment notification email failed:", result.error);
    }
  });

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
