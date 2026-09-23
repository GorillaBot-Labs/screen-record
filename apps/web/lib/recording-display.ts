export function displayTitle(recording: {
  title: string | null;
  gcsObjectName: string;
}) {
  const t = recording.title?.trim();
  if (t) return t;
  const base = recording.gcsObjectName.split("/").pop() ?? recording.gcsObjectName;
  try {
    return decodeURIComponent(base.replace(/\.mp4$/i, ""));
  } catch {
    return base.replace(/\.mp4$/i, "");
  }
}

/** RSC → client props serialize `Date` as ISO strings. */
export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export const recordingDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const recordingDateLongFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

export function relativeTime(from: Date, now = new Date()): string {
  const diffMs = now.getTime() - from.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return recordingDateFormatter.format(from);
}
