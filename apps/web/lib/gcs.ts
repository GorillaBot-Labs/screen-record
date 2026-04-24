import { Storage } from "@google-cloud/storage";

export const RECORDINGS_PREFIX = "recordings/";

export function getStorage(): Storage {
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

export function getGcsBucketName(): string {
  const name = process.env.GCS_BUCKET?.trim();
  if (name) return name;
  return "screen-record";
}

/** Only allow deletes for desktop-style keys under `recordings/*.mp4`. */
export function assertRecordingsMp4Key(gcsObjectName: string): void {
  const name = gcsObjectName.trim();
  if (!name.startsWith(RECORDINGS_PREFIX)) {
    throw new Error(`Invalid object name: must start with ${RECORDINGS_PREFIX}`);
  }
  if (!name.toLowerCase().endsWith(".mp4")) {
    throw new Error("Invalid object name: must end with .mp4");
  }
}

export async function deleteRecordingsMp4Object(gcsObjectName: string): Promise<void> {
  assertRecordingsMp4Key(gcsObjectName);
  const bucket = getStorage().bucket(getGcsBucketName());
  await bucket.file(gcsObjectName).delete({ ignoreNotFound: true });
}
