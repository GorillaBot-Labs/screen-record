"use client";

import { formatVideoTimestamp } from "@/lib/video-time";
import { MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type RecordingCommentItem = {
  id: string;
  body: string;
  timestampSeconds: number;
  createdAt: string;
};

type RecordingViewerProps = {
  recordingId: string;
  publicUrl: string;
  initialComments: RecordingCommentItem[];
  startAtSeconds?: number;
};

function asDate(value: string): Date {
  return new Date(value);
}

const postedFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RecordingViewer({
  recordingId,
  publicUrl,
  initialComments,
  startAtSeconds,
}: RecordingViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncTime = () => setPlaybackSeconds(video.currentTime);

    const onLoadedMetadata = () => {
      if (startAtSeconds != null && startAtSeconds >= 0) {
        video.currentTime = startAtSeconds;
      }
      syncTime();
    };

    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("seeked", syncTime);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    if (video.readyState >= 1) onLoadedMetadata();

    return () => {
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("seeked", syncTime);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [startAtSeconds]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => {
      video.pause();
    });
  }, []);

  const submitComment = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    const video = videoRef.current;
    const timestampSeconds = video?.currentTime ?? 0;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/recordings/${recordingId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, timestampSeconds }),
      });
      const data: unknown = await res.json().catch(() => null);
      const ok =
        typeof data === "object" &&
        data !== null &&
        "ok" in data &&
        (data as { ok: unknown }).ok === true;
      if (!ok || !res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not save comment";
        toast.error(msg);
        return;
      }
      const comment =
        typeof data === "object" &&
        data !== null &&
        "comment" in data &&
        typeof (data as { comment: unknown }).comment === "object"
          ? (data as { comment: RecordingCommentItem }).comment
          : null;
      if (!comment) {
        toast.error("Could not save comment");
        return;
      }
      setComments((prev) =>
        [...prev, comment].sort(
          (a, b) =>
            a.timestampSeconds - b.timestampSeconds ||
            asDate(a.createdAt).getTime() - asDate(b.createdAt).getTime(),
        ),
      );
      setDraft("");
      toast.success("Note added");
    } catch {
      toast.error("Could not save comment");
    } finally {
      setSubmitting(false);
    }
  }, [draft, recordingId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      <div className="min-w-0 flex-1 px-6 py-6 md:px-8">
        <section className="overflow-hidden rounded-xl bg-zinc-950 shadow-lg shadow-zinc-950/10">
          <div className="aspect-video">
            <video
              ref={videoRef}
              className="h-full w-full object-contain"
              controls
              playsInline
              preload="metadata"
              src={publicUrl}
            >
              Your browser does not support embedded video.
            </video>
          </div>
        </section>

        <p className="mt-4 text-sm text-muted xl:hidden">
          Add notes in the comments section — each one saves at the current playback time.
        </p>
        <p className="mt-4 hidden text-sm text-muted xl:block">
          Anyone with this link can watch and leave anonymous notes.
        </p>
      </div>

      <aside className="flex min-h-[22rem] flex-col border-t border-border bg-surface/40 xl:sticky xl:top-0 xl:h-[calc(100dvh-9.5rem)] xl:max-h-[calc(100dvh-9.5rem)] xl:w-[22rem] xl:shrink-0 xl:border-t-0 xl:border-l xl:bg-background">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageSquare className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Comments</h2>
          <span className="ml-auto text-xs text-muted">{comments.length}</span>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <ul className="flex-1 space-y-1 overflow-y-auto p-3">
            {comments.length === 0 ? (
              <li className="px-2 py-8 text-center text-sm text-muted">
                No notes yet. Add a thought — it will be saved at the current moment in the video.
              </li>
            ) : (
              comments.map((comment) => (
                <li key={comment.id}>
                  <button
                    type="button"
                    onClick={() => seekTo(comment.timestampSeconds)}
                    className="group w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent-soft/60"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-medium text-accent">
                        {formatVideoTimestamp(comment.timestampSeconds)}
                      </span>
                      <span className="text-xs text-muted">
                        Anonymous · {postedFormatter.format(asDate(comment.createdAt))}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{comment.body}</p>
                  </button>
                </li>
              ))
            )}
          </ul>

          <form
            className="shrink-0 border-t border-border bg-background p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitComment();
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 font-mono text-xs font-medium text-accent">
                {formatVideoTimestamp(playbackSeconds)}
              </span>
              <span className="text-xs text-muted">Saves at this time</span>
            </div>
            <label htmlFor="comment-body" className="sr-only">
              Comment
            </label>
            <textarea
              id="comment-body"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Leave a note…"
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent-muted focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
              {submitting ? "Saving…" : "Add note"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
