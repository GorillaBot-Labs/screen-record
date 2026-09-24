import path from 'node:path'
import { tmpdir } from 'node:os'

/** Temp staging dir for recorder output; file is removed after a successful GCS upload. */
export function recordingStagingDir(): string {
  return path.join(tmpdir(), 'screen-record')
}

export function isPathInsideRecordingStagingDir(filePath: string): boolean {
  const abs = path.resolve(filePath)
  const root = path.resolve(recordingStagingDir())
  return abs === root || abs.startsWith(root + path.sep)
}
