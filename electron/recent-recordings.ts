import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const MAX_RECENT = 5

function storeFilePath(): string {
  return path.join(homedir(), '.screen-record', 'recent-recordings.json')
}

type Store = { urls: string[] }

function readStore(): Store {
  const file = storeFilePath()
  try {
    if (!existsSync(file)) return { urls: [] }
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Store).urls)) {
      return { urls: [] }
    }
    const urls = (parsed as Store).urls.filter(
      (u): u is string => typeof u === 'string' && u.startsWith('https://'),
    )
    return { urls: urls.slice(0, MAX_RECENT) }
  } catch {
    return { urls: [] }
  }
}

export function readRecentRecordingUrls(): string[] {
  return readStore().urls
}

export function recordSuccessfulUploadUrl(url: string): void {
  if (!url.startsWith('https://')) return
  const { urls } = readStore()
  const next = [url, ...urls.filter((u) => u !== url)].slice(0, MAX_RECENT)
  try {
    mkdirSync(path.dirname(storeFilePath()), { recursive: true })
    writeFileSync(storeFilePath(), JSON.stringify({ urls: next }), 'utf8')
  } catch {
    /* ignore write errors (permissions, disk) */
  }
}
