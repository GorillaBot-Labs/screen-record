import { ServerClient } from "postmark";
import {
  buildViewNotificationEmail,
  type ViewNotificationPayload,
} from "@/lib/emails/view-notification";

export async function sendViewNotification(payload: ViewNotificationPayload): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) return;

  const to =
    process.env.VIEW_NOTIFY_EMAIL?.trim() ||
    process.env.COMMENT_NOTIFY_EMAIL?.trim() ||
    "john@gorillabotlabs.com";
  const from =
    process.env.POSTMARK_FROM_EMAIL?.trim() || "recordings@gorillabotlabs.com";

  const email = buildViewNotificationEmail(payload);
  const client = new ServerClient(token);

  try {
    await client.sendEmail({
      From: from,
      To: to,
      Subject: email.subject,
      HtmlBody: email.htmlBody,
      TextBody: email.textBody,
      MessageStream: "outbound",
    });
  } catch (err) {
    console.error("Failed to send view notification:", err);
  }
}
