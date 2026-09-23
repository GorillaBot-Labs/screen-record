import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const MAX_RECENT = 5;

export type RecentRecordingEntry = {
  url: string;
  title: string;
  recordedAt: string;
};

type Store = { entries: RecentRecordingEntry[] };

function storeFilePath(): string {
  return path.join(homedir(), ".screen-record", "recent-recordings.json");
}

function normalizeEntry(raw: unknown): RecentRecordingEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<RecentRecordingEntry>;
  if (typeof entry.url !== "string" || !entry.url.startsWith("https://")) return null;
  const title =
    typeof entry.title === "string" && entry.title.trim()
      ? entry.title.trim()
      : "Recording";
  const recordedAt =
    typeof entry.recordedAt === "string" && entry.recordedAt.trim()
      ? entry.recordedAt
      : new Date().toISOString();
  return { url: entry.url, title, recordedAt };
}

function readStore(): Store {
  const file = storeFilePath();
  try {
    if (!existsSync(file)) return { entries: [] };
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { entries: [] };

    const legacyUrls = (parsed as { urls?: unknown }).urls;
    if (Array.isArray(legacyUrls)) {
      return {
        entries: legacyUrls
          .filter((url): url is string => typeof url === "string" && url.startsWith("https://"))
          .map((url) => ({
            url,
            title: titleFromUrl(url),
            recordedAt: new Date().toISOString(),
          }))
          .slice(0, MAX_RECENT),
      };
    }

    const entries = (parsed as Store).entries;
    if (!Array.isArray(entries)) return { entries: [] };
    return {
      entries: entries
        .map(normalizeEntry)
        .filter((entry): entry is RecentRecordingEntry => entry != null)
        .slice(0, MAX_RECENT),
    };
  } catch {
    return { entries: [] };
  }
}

function titleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).pop();
    if (segment && segment !== "r") return decodeURIComponent(segment);
  } catch {
    /* ignore */
  }
  return "Recording";
}

export function buildRecentEntries(
  existing: RecentRecordingEntry[],
  next: RecentRecordingEntry,
  max = MAX_RECENT,
): RecentRecordingEntry[] {
  return [next, ...existing.filter((entry) => entry.url !== next.url)].slice(0, max);
}

export function readRecentRecordings(): RecentRecordingEntry[] {
  return readStore().entries;
}

/** @deprecated Use {@link readRecentRecordings}. */
export function readRecentRecordingUrls(): string[] {
  return readRecentRecordings().map((entry) => entry.url);
}

export function recordSuccessfulUpload(input: {
  url: string;
  title?: string;
  recordedAt?: string;
}): void {
  if (!input.url.startsWith("https://")) return;
  const { entries } = readStore();
  const nextEntry: RecentRecordingEntry = {
    url: input.url,
    title: input.title?.trim() || titleFromUrl(input.url),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  const next = buildRecentEntries(entries, nextEntry);
  try {
    mkdirSync(path.dirname(storeFilePath()), { recursive: true });
    writeFileSync(storeFilePath(), JSON.stringify({ entries: next }), "utf8");
  } catch {
    /* ignore write errors (permissions, disk) */
  }
}

/** @deprecated Use {@link recordSuccessfulUpload}. */
export function recordSuccessfulUploadUrl(url: string): void {
  recordSuccessfulUpload({ url });
}
