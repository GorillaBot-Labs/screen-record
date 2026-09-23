import { describe, expect, it } from "vitest";
import { updateRecordingTagsInCatalog } from "@/lib/recording-catalog";
import { prisma } from "@/lib/prisma";
import { createTestRecording } from "./helpers/recording-fixture";

describe("updateRecordingTagsInCatalog", () => {
  it("persists normalized tags on a recording", async () => {
    const recording = await createTestRecording({ tags: ["old"] });

    const result = await updateRecordingTagsInCatalog(recording.id, [
      "  Product Demo  ",
      "product demo",
      "Launch",
    ]);

    expect(result).toEqual({ ok: true, tags: ["Product Demo", "Launch"] });

    const updated = await prisma.recording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(updated.tags).toEqual(["Product Demo", "Launch"]);
  });

  it("returns an error when the recording does not exist", async () => {
    const result = await updateRecordingTagsInCatalog("000000000000000000000000", ["demo"]);

    expect(result).toEqual({ ok: false, error: "Could not update tags" });
  });
});
