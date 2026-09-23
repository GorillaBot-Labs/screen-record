import type { ViewNotificationPayload } from "@/lib/emails/view-notification";

export async function sendViewNotification(_payload: ViewNotificationPayload): Promise<void> {
  // First-view emails disabled for now.
}
