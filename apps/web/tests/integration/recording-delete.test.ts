import { describe, expect, it, vi } from "vitest";
import { deleteRecordingById, deleteRecordingsByIds } from "@/lib/recording-delete";
import { prisma } from "@/lib/prisma";
import { createTestRecording } from "./helpers/recording-fixture";

vi.mock("@/lib/gcs", () => ({
  deleteRecordingsMp4Object: vi.fn().mockResolvedValue(undefined),
}));

describe("deleteRecordingById", () => {
  it("removes the recording and its comments from the catalog", async () => {
    const recording = await createTestRecording();
    await prisma.recordingComment.create({
      data: {
        recordingId: recording.id,
        body: "Looks good",
        timestampSeconds: 12,
      },
    });

    const result = await deleteRecordingById(recording.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.recording.findUnique({ where: { id: recording.id } })).toBeNull();
    expect(await prisma.recordingComment.count({ where: { recordingId: recording.id } })).toBe(0);
  });
});

describe("deleteRecordingsByIds", () => {
  it("deletes multiple recordings and reports how many were removed", async () => {
    const first = await createTestRecording();
    const second = await createTestRecording();

    const result = await deleteRecordingsByIds([first.id, second.id]);

    expect(result).toEqual({
      ok: true,
      deleted: 2,
      deletedIds: [first.id, second.id],
    });
  });

  it("stops on failure and reports partial progress", async () => {
    const existing = await createTestRecording();
    const missingId = "000000000000000000000000";

    const result = await deleteRecordingsByIds([existing.id, missingId]);

    expect(result.ok).toBe(false);
    expect(result.deleted).toBe(1);
    expect(result.deletedIds).toEqual([existing.id]);
    expect(await prisma.recording.findUnique({ where: { id: existing.id } })).toBeNull();
  });

  it("rejects an empty selection", async () => {
    expect(await deleteRecordingsByIds([])).toEqual({
      ok: false,
      error: "No recordings selected",
      deleted: 0,
      deletedIds: [],
    });
  });
});
