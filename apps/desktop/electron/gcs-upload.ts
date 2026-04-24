import { basename } from 'node:path'
import { Storage } from '@google-cloud/storage'

/** Object key prefix inside the bucket (e.g. `recordings/recording_….mp4`). */
const GCS_OBJECT_PREFIX = 'recordings'

/**
 * Upload finished recordings to Google Cloud Storage and return the canonical **public** HTTPS URL.
 *
 * **Uniform bucket-level access:** configure the bucket **once** in Google Cloud (Console or
 * Terraform), not in this app on every upload:
 *
 * 1. Bucket → **Permissions** → **Grant access** → Principal **`allUsers`** → role **Storage Object
 *    Viewer** (`roles/storage.objectViewer`).
 * 2. If **Public Access Prevention** is enforced on the bucket, turn it off for public links (or
 *    use a dedicated bucket).
 * 3. Your upload **service account** only needs to **create objects** (e.g. **Storage Object
 *    Creator** on the bucket)—not `setIamPolicy`.
 *
 * Configure:
 * - `GCS_BUCKET` — bucket name (required; main defaults to `screen-record` if unset).
 * - Auth: main sets `GOOGLE_APPLICATION_CREDENTIALS` to `~/.screen-record/gcp-credentials.json`.
 */
export async function uploadRecordingToGcs(
  localPath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const bucketName = process.env.GCS_BUCKET?.trim()
  if (!bucketName) {
    return {
      ok: false,
      error:
        'GCS_BUCKET is not set. Add it to your environment (and Google credentials) to upload recordings.',
    }
  }

  const objectName = `${GCS_OBJECT_PREFIX}/${basename(localPath)}`

  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)

    await bucket.upload(localPath, {
      destination: objectName,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=3600',
      },
    })

    const file = bucket.file(objectName)
    const url = file.publicUrl()

    return { ok: true, url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
