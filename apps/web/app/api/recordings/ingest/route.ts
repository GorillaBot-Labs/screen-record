import { appBaseUrl } from "@/lib/app-url";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Shared with the desktop app (`DESKTOP_INGEST_SECRET`). Same value in `apps/web/.env` and wherever you launch Electron. */
export async function POST(request: Request) {
  const expected = process.env.DESKTOP_INGEST_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Set DESKTOP_INGEST_SECRET in web env." }, { status: 503 });
  }
  if ((request.headers.get("x-desktop-ingest-secret") ?? "").trim() !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const gcsObjectName =
    typeof body === "object" && body !== null && "gcsObjectName" in body
      ? String((body as { gcsObjectName: unknown }).gcsObjectName).trim()
      : "";
  const publicUrl =
    typeof body === "object" && body !== null && "publicUrl" in body
      ? String((body as { publicUrl: unknown }).publicUrl).trim()
      : "";
  if (!gcsObjectName || !publicUrl) {
    return NextResponse.json({ ok: false, error: "Need gcsObjectName and publicUrl" }, { status: 400 });
  }

  const filename = gcsObjectName.split("/").pop() ?? gcsObjectName;
  const titleFromFilename = filename.replace(/\.mp4$/i, "") || undefined;

  const durationRaw =
    typeof body === "object" && body !== null && "durationSeconds" in body
      ? Number((body as { durationSeconds: unknown }).durationSeconds)
      : NaN;
  const durationSeconds =
    Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;

  const posterRaw =
    typeof body === "object" && body !== null && "posterUrl" in body
      ? String((body as { posterUrl: unknown }).posterUrl).trim()
      : "";
  let posterUrl: string | undefined;
  if (posterRaw) {
    let parsed: URL;
    try {
      parsed = new URL(posterRaw);
    } catch {
      return NextResponse.json({ ok: false, error: "posterUrl must be an http(s) URL" }, { status: 400 });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ ok: false, error: "posterUrl must be an http(s) URL" }, { status: 400 });
    }
    posterUrl = parsed.toString();
  }

  const recording = await prisma.recording.upsert({
    where: { gcsObjectName },
    create: {
      gcsObjectName,
      publicUrl,
      title: titleFromFilename,
      ...(durationSeconds != null ? { durationSeconds } : {}),
      ...(posterUrl != null ? { posterUrl } : {}),
    },
    update: {
      publicUrl,
      ...(durationSeconds != null ? { durationSeconds } : {}),
      ...(posterUrl != null ? { posterUrl } : {}),
    },
    select: { id: true, title: true },
  });

  const detailUrl = `${appBaseUrl()}/r/${recording.id}`;
  return NextResponse.json({
    ok: true,
    id: recording.id,
    detailUrl,
    title: recording.title,
  });
}
