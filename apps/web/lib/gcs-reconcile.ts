import { Storage } from "@google-cloud/storage";
import type { PrismaClient } from "@prisma/client";

const RECORDINGS_PREFIX = "recordings/";

function getStorage(): Storage {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const credentials = JSON.parse(raw) as { project_id?: string };
    return new Storage({
      credentials,
      projectId: credentials.project_id,
    });
  }
  return new Storage();
}

function bucketName(): string {
  const name = process.env.GCS_BUCKET?.trim();
  if (name) return name;
  return "screen-record";
}

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
  const bucket = storage.bucket(bucketName());

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
