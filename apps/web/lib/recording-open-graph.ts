export type RecordingOpenGraph = {
  title: string;
  description: string;
  url: string;
  images: Array<{ url: string; width: number; height: number; alt: string }>;
};

export function buildRecordingOpenGraph(input: {
  recordingId: string;
  title: string;
  notes: string | null;
  appBaseUrl: string;
}): RecordingOpenGraph {
  const base = input.appBaseUrl.replace(/\/+$/, "");
  const url = `${base}/r/${input.recordingId}`;
  const description = input.notes?.trim() || "Screen recording";

  return {
    title: input.title,
    description,
    url,
    images: [
      {
        url: `${base}/r/${input.recordingId}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: input.title,
      },
    ],
  };
}
