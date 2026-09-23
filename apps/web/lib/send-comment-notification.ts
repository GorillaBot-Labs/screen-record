import {
  buildCommentNotificationEmail,
  type CommentNotificationPayload,
} from "@/lib/emails/comment-notification";
import { ServerClient } from "postmark";

function postmarkClient(): ServerClient | null {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) return null;
  return new ServerClient(token);
}

function notifyEmail(): string {
  return (
    process.env.COMMENT_NOTIFY_EMAIL?.trim() || "john@gorillabotlabs.com"
  );
}

function fromEmail(): string {
  return (
    process.env.POSTMARK_FROM_EMAIL?.trim() || "recordings@gorillabotlabs.com"
  );
}

export async function sendCommentNotification(
  payload: CommentNotificationPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = postmarkClient();
  if (!client) {
    return { ok: false, error: "POSTMARK_SERVER_TOKEN is not set" };
  }

  const { subject, htmlBody, textBody } = buildCommentNotificationEmail(payload);

  try {
    await client.sendEmail({
      From: fromEmail(),
      To: notifyEmail(),
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
