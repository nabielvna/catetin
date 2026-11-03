import "server-only";

import { dispatchPending } from "@/services/notifications/dispatch";
export async function runNotifications() {
  const sent = await dispatchPending({ limit: 200 });
  return { sent };
}
