const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/\s+/g, " ");
  if (!tag || tag.length > MAX_TAG_LENGTH) return null;
  return tag;
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
