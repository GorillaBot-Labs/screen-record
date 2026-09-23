"use client";

import { useEffect } from "react";

export function RecordingViewTracker({ recordingId }: { recordingId: string }) {
  useEffect(() => {
    const key = `recording-view:${recordingId}`;
    if (sessionStorage.getItem(key)) return;

    void fetch(`/api/recordings/${recordingId}/view`, { method: "POST" })
      .then((res) => {
        if (res.ok) sessionStorage.setItem(key, "1");
      })
      .catch(() => {
        /* ignore tracking errors */
      });
  }, [recordingId]);

  return null;
}
