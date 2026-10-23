import { describe, expect, it } from "vitest";
import {
  contentDispositionAttachment,
  recordingDownloadFilename,
  recordingDownloadPath,
} from "@/lib/recording-download";

describe("recordingDownloadFilename", () => {
  it("uses the object basename", () => {
    expect(
      recordingDownloadFilename("recordings/my-demo.mp4", "abc"),
    ).toBe("my-demo.mp4");
  });

  it("falls back when the object name has no slash", () => {
    expect(recordingDownloadFilename("", "abc")).toBe("recording-abc.mp4");
  });
});

describe("recordingDownloadPath", () => {
  it("points at the same-origin download API", () => {
    expect(recordingDownloadPath("abc123")).toBe("/api/recordings/abc123/download");
  });
});

describe("contentDispositionAttachment", () => {
  it("includes ASCII and UTF-8 filename parameters", () => {
    expect(contentDispositionAttachment("demo.mp4")).toBe(
      'attachment; filename="demo.mp4"; filename*=UTF-8\'\'demo.mp4',
    );
  });

  it("escapes non-ASCII names for the legacy filename field", () => {
    const header = contentDispositionAttachment("café.mp4");
    expect(header).toContain('filename="caf_.mp4"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain("%C3%A9");
  });
});
