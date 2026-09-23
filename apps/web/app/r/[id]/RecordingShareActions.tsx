"use client";

import { buildEmbedHtml } from "@/lib/share-links";
import { Check, Code, Copy, Download, ExternalLink } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

export function RecordingShareActions({
  shareUrl,
  publicUrl,
  downloadFilename,
  compact = false,
}: {
  shareUrl: string;
  publicUrl: string;
  downloadFilename: string;
  compact?: boolean;
}) {
  const btnClass = compact
    ? "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
    : "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);

  const absoluteShareUrl = useMemo(
    () => (shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`),
    [shareUrl],
  );

  const embedHtml = useMemo(() => buildEmbedHtml(absoluteShareUrl), [absoluteShareUrl]);

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteShareUrl);
      setCopied("link");
      toast.success("Link copied to clipboard");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }, [absoluteShareUrl]);

  const copyEmbed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedHtml);
      setCopied("embed");
      toast.success("Embed code copied");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy embed code");
    }
  }, [embedHtml]);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className={`${btnClass} bg-accent text-white hover:bg-accent-hover`}
        >
          {copied === "link" ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Copy className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{copied === "link" ? "Copied" : "Copy link"}</span>
        </button>
        <a
          href={publicUrl}
          download={downloadFilename}
          className={`${btnClass} border border-border bg-background text-foreground hover:bg-surface`}
        >
          <Download className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          Download
        </a>
        <button
          type="button"
          onClick={() => setEmbedOpen(true)}
          className={`${btnClass} border border-border bg-background text-foreground hover:bg-surface`}
        >
          <Code className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          Embed
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnClass} border border-border bg-background text-foreground hover:bg-surface`}
        >
          <ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          Direct video
        </a>
      </div>

      {embedOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"
          role="presentation"
          onClick={() => setEmbedOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="embed-dialog-title"
            className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="embed-dialog-title" className="text-base font-semibold text-foreground">
              Embed this recording
            </h2>
            <p className="mt-1 text-sm text-muted">
              Paste this snippet into Notion, docs, or your site.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-surface p-3 text-xs text-foreground">
              {embedHtml}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmbedOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void copyEmbed()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                {copied === "embed" ? "Copied" : "Copy embed code"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
