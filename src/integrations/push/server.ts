import "server-only";

import webpush from "web-push";

import { env } from "@/lib/server/env";

let vapidReady = false;

export async function sendPush(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; url: string; tag?: string },
): Promise<boolean> {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(e.VAPID_SUBJECT ?? "mailto:admin@example.com", e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    vapidReady = true;
  }
  await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 24 * 3600, urgency: "high" });
  return true;
}
