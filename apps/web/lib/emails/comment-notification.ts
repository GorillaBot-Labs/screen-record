import { displayTitle } from "@/lib/recording-display";
import { formatVideoTimestamp } from "@/lib/video-time";

export type CommentNotificationPayload = {
  recordingTitle: string;
  recordingPageUrl: string;
  videoUrl: string;
  timestampSeconds: number;
  commentBody: string;
  postedAt: Date;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCommentNotificationEmail(payload: CommentNotificationPayload): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const timestampLabel = formatVideoTimestamp(payload.timestampSeconds);
  const watchUrl = `${payload.recordingPageUrl}?t=${Math.floor(payload.timestampSeconds)}`;
  const postedLabel = payload.postedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const safeComment = escapeHtml(payload.commentBody);
  const safeTitle = escapeHtml(payload.recordingTitle);

  const subject = `New note on ${payload.recordingTitle} at ${timestampLabel}`;

  const textBody = [
    "Recordings — new comment",
    "",
    `Video: ${payload.recordingTitle}`,
    `Timestamp: ${timestampLabel}`,
    `Posted: ${postedLabel}`,
    "",
    "Comment:",
    payload.commentBody,
    "",
    `Watch at this moment: ${watchUrl}`,
    `Recording page: ${payload.recordingPageUrl}`,
    `Direct video: ${payload.videoUrl}`,
  ].join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#625df5;padding:24px 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:40px;height:40px;background-color:rgba(255,255,255,0.16);border-radius:10px;text-align:center;vertical-align:middle;font-size:15px;font-weight:700;color:#ffffff;line-height:40px;">R</td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:rgba(255,255,255,0.82);">Recordings</div>
                    <div style="font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">New comment</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.03em;">Video</p>
              <h1 style="margin:0 0 20px;font-size:22px;line-height:1.35;font-weight:700;color:#18181b;">${safeTitle}</h1>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding-right:12px;">
                    <span style="display:inline-block;background-color:#f0effe;color:#625df5;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:700;padding:6px 10px;border-radius:8px;">${timestampLabel}</span>
                  </td>
                  <td style="font-size:13px;color:#71717a;">Anonymous · ${escapeHtml(postedLabel)}</td>
                </tr>
              </table>

              <div style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.03em;">Comment</p>
                <p style="margin:0;font-size:16px;line-height:1.6;color:#18181b;white-space:pre-wrap;">${safeComment}</p>
              </div>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:10px;background-color:#625df5;">
                    <a href="${escapeHtml(watchUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Watch at ${timestampLabel}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
                <a href="${escapeHtml(watchUrl)}" style="color:#625df5;text-decoration:none;">Open recording page</a>
                ·
                <a href="${escapeHtml(payload.videoUrl)}" style="color:#625df5;text-decoration:none;">Direct video</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, htmlBody, textBody };
}

export function commentNotificationFromRecording(
  recording: {
    id: string;
    title: string | null;
    gcsObjectName: string;
    publicUrl: string;
  },
  comment: { body: string; timestampSeconds: number; createdAt: Date },
  baseUrl: string,
): CommentNotificationPayload {
  return {
    recordingTitle: displayTitle(recording),
    recordingPageUrl: `${baseUrl}/r/${recording.id}`,
    videoUrl: comment.timestampSeconds > 0
      ? `${recording.publicUrl}#t=${Math.floor(comment.timestampSeconds)}`
      : recording.publicUrl,
    timestampSeconds: comment.timestampSeconds,
    commentBody: comment.body,
    postedAt: comment.createdAt,
  };
}
