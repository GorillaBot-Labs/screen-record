export type RecordingOpenGraph = {
  title: string;
  description: string;
  url: string;
  images: Array<{
    url: string;
    alt: string;
    width?: number;
    height?: number;
  }>;
  videos: Array<{ url: string; type: string }>;
};

export function buildRecordingOpenGraph(input: {
  recordingId: string;
  title: string;
  notes: string | null;
  appBaseUrl: string;
  publicUrl: string;
  posterUrl?: string | null;
}): RecordingOpenGraph {
  const base = input.appBaseUrl.replace(/\/+$/, "");
  const url = `${base}/r/${input.recordingId}`;
  const description = input.notes?.trim() || "Screen recording";
  const posterUrl = input.posterUrl?.trim();

  return {
    title: input.title,
    description,
    url,
    images: posterUrl
      ? [{ url: posterUrl, alt: input.title }]
      : [
          {
            url: `${base}/r/${input.recordingId}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: input.title,
          },
        ],
    videos: [
      {
        url: input.publicUrl,
        type: "video/mp4",
      },
    ],
  };
}
