import { describe, expect, it } from "vitest";
import { recordViewInCatalog } from "@/lib/recording-analytics";
import { prisma } from "@/lib/prisma";
import { createTestRecording } from "./helpers/recording-fixture";

describe("recordViewInCatalog", () => {
  it("increments view count and records last viewed time", async () => {
    const recording = await createTestRecording();

    const first = await recordViewInCatalog(recording.id);
    expect(first).toEqual({ ok: true, viewCount: 1, firstView: true });

    const second = await recordViewInCatalog(recording.id);
    expect(second).toEqual({ ok: true, viewCount: 2, firstView: false });

    const updated = await prisma.recording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(updated.viewCount).toBe(2);
    expect(updated.lastViewedAt).toBeInstanceOf(Date);
  });
});
