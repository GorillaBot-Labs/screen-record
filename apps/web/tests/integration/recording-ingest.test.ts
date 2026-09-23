import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/recordings/ingest/route";
import { prisma } from "@/lib/prisma";

describe("POST /api/recordings/ingest", () => {
  it("stores durationSeconds from the desktop ingest payload", async () => {
    const secret = process.env.DESKTOP_INGEST_SECRET ?? "test-ingest-secret";
    process.env.DESKTOP_INGEST_SECRET = secret;

    const gcsObjectName = `recordings/test-ingest-${Date.now()}.mp4`;
    const request = new Request("http://localhost/api/recordings/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-desktop-ingest-secret": secret,
      },
      body: JSON.stringify({
        gcsObjectName,
        publicUrl: `https://storage.example.com/${gcsObjectName}`,
        durationSeconds: 142.5,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const recording = await prisma.recording.findUniqueOrThrow({
      where: { gcsObjectName },
    });
    expect(recording.durationSeconds).toBe(142.5);
  });
});
