import { describe, expect, it } from "vitest";
import { updateRecordingMetadataInCatalog } from "@/lib/recording-catalog";
import { prisma } from "@/lib/prisma";
import { createTestRecording } from "./helpers/recording-fixture";

describe("updateRecordingMetadataInCatalog", () => {
  it("persists title and description on a recording", async () => {
    const recording = await createTestRecording({ title: "Old title", notes: "Old notes" });

    const result = await updateRecordingMetadataInCatalog(recording.id, {
      title: "  New title  ",
      notes: " Updated description ",
    });

    expect(result).toEqual({
      ok: true,
      title: "New title",
      notes: "Updated description",
    });

    const updated = await prisma.recording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(updated.title).toBe("New title");
    expect(updated.notes).toBe("Updated description");
  });

  it("rejects invalid title updates", async () => {
    const recording = await createTestRecording();

    const result = await updateRecordingMetadataInCatalog(recording.id, {
      title: "   ",
      notes: "Still valid",
    });

    expect(result).toEqual({ ok: false, error: "Invalid title" });
  });
});
