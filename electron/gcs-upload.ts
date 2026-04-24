import { basename } from 'node:path'
import { Storage } from '@google-cloud/storage'

/**
 * Upload finished recordings to Google Cloud Storage.
 *
 * Configure:
 * - `GCS_BUCKET` — bucket name (required).
 * - `GCS_OBJECT_PREFIX` — optional object key prefix (default `recordings`).
 * - `GCS_SIGNED_URL_DAYS` — read URL lifetime in days (default `90`).
 * - Auth: `GOOGLE_APPLICATION_CREDENTIALS` (path to service account JSON), or
 *   Application Default Credentials (`gcloud auth application-default login`).
 *
 * The service account needs `storage.objects.create` on the bucket. Signed URLs
 * require permission to sign (the key in the JSON account is used for v4 URLs).
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

  const prefix = (process.env.GCS_OBJECT_PREFIX?.trim() || 'recordings').replace(/^\/+|\/+$/g, '')
  const objectName = `${prefix}/${basename(localPath)}`
  const daysRaw = process.env.GCS_SIGNED_URL_DAYS?.trim()
  const days = daysRaw != null && daysRaw !== '' ? Number.parseInt(daysRaw, 10) : 90
  const signedDays = Number.isFinite(days) && days > 0 ? days : 90

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
    const expires = Date.now() + signedDays * 24 * 60 * 60 * 1000
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
    })

    return { ok: true, url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
