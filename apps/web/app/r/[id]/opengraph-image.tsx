import { displayTitle } from "@/lib/recording-display";
import { prisma } from "@/lib/prisma";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Screen recording";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id },
    select: { title: true, gcsObjectName: true },
  });

  const title = recording ? displayTitle(recording) : "Screen recording";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
          padding: 80,
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#a5b4fc",
            marginBottom: 24,
          }}
        >
          Recordings
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, maxWidth: 900 }}>
          {title}
        </div>
      </div>
    ),
    { ...size },
  );
}
