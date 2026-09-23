export type ViewNotificationPayload = {
  recordingTitle: string;
  recordingPageUrl: string;
  videoUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildViewNotificationEmail(payload: ViewNotificationPayload): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const safeTitle = escapeHtml(payload.recordingTitle);
  const subject = `First view on ${payload.recordingTitle}`;

  const textBody = [
    "Recordings — first view",
    "",
    `Video: ${payload.recordingTitle}`,
    `Recording page: ${payload.recordingPageUrl}`,
    `Direct video: ${payload.videoUrl}`,
  ].join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#625df5;">First view</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:700;">${safeTitle}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#52525b;">Someone opened your recording for the first time.</p>
    <a href="${escapeHtml(payload.recordingPageUrl)}" style="display:inline-block;background:#625df5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px;">Open recording</a>
  </div>
</body>
</html>`;

  return { subject, htmlBody, textBody };
}
