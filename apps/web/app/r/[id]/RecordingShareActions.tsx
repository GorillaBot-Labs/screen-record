"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function RecordingShareActions({
  shareUrl,
  publicUrl,
}: {
  shareUrl: string;
  publicUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyShareLink = useCallback(async () => {
    try {
      const absolute =
        shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`;
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      toast.success("Link copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }, [shareUrl]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copyShareLink()}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        {copied ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{copied ? "Copied" : "Copy link"}</span>
      </button>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
      >
        <ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        Direct video
      </a>
    </div>
  );
}
