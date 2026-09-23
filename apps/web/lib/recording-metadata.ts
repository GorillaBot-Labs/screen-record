const MAX_TITLE_LENGTH = 120;
const MAX_NOTES_LENGTH = 2000;

export function normalizeRecordingTitle(raw: string): string | null {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

export function normalizeRecordingNotes(raw: string): string | null {
  const notes = raw.trim();
  if (notes.length > MAX_NOTES_LENGTH) return null;
  return notes;
}
