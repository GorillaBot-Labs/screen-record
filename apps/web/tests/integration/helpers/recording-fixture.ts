import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function createTestRecording(
  overrides: Partial<Prisma.RecordingCreateInput> = {},
) {
  const suffix = randomUUID();
  return prisma.recording.create({
    data: {
      gcsObjectName: `recordings/test-${suffix}.mp4`,
      publicUrl: `https://storage.example.com/recordings/test-${suffix}.mp4`,
      ...overrides,
    },
  });
}
