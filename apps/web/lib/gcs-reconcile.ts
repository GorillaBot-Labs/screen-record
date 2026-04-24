import type { PrismaClient } from "@prisma/client";
import { getGcsBucketName, getStorage, RECORDINGS_PREFIX } from "./gcs";

export type ReconcileStats = {
  /** MP4 objects under `recordings/` seen in GCS. */
  scanned: number;
  /** Rows written via Prisma upsert (create or update). */
  upserted: number;
};

/**
 * Lists objects under `recordings/` in GCS and upserts rows keyed by `gcsObjectName` (idempotent).
 * Only includes `*.mp4` objects (matches desktop uploads).
 */
export async function reconcileRecordingsFromGcs(
  db: PrismaClient,
): Promise<ReconcileStats> {
  const storage = getStorage();
  const bucket = storage.bucket(getGcsBucketName());

  let scanned = 0;
  let upserted = 0;

  for await (const file of bucket.getFilesStream({ prefix: RECORDINGS_PREFIX })) {
    const name = file.name;
    if (!name.toLowerCase().endsWith(".mp4")) continue;
    if (name.endsWith("/")) continue;

    scanned += 1;
    const publicUrl = file.publicUrl();
    const timeCreated = file.metadata.timeCreated
      ? new Date(file.metadata.timeCreated)
      : new Date();

    await db.recording.upsert({
      where: { gcsObjectName: name },
      create: {
        gcsObjectName: name,
        publicUrl,
        createdAt: timeCreated,
      },
      update: {
        publicUrl,
      },
    });
    upserted += 1;
  }

  return { scanned, upserted };
}
