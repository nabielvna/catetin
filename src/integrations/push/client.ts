"use client";

type SubscriptionData = { endpoint: string; p256dh: string; auth: string; userAgent: string };
type Persist = (data: SubscriptionData) => Promise<{ ok: boolean }>;
type Remove = (data: { endpoint: string }) => Promise<{ ok: boolean }>;

export type PushState = "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const supported = (vapidPublicKey: string | null) =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window &&
  Boolean(vapidPublicKey);

async function save(sub: PushSubscription, persist: Persist) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const result = await persist({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  });
  if (!result.ok) throw new Error("Push subscription was not saved");
}

export async function pushState(vapidPublicKey: string | null): Promise<PushState> {
  if (!supported(vapidPublicKey)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

export async function enablePush(vapidPublicKey: string | null, persist: Persist): Promise<PushState> {
  if (!supported(vapidPublicKey)) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
  });
  await save(sub, persist);
  return "on";
}

export async function disablePush(remove: Remove): Promise<PushState> {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const result = await remove({ endpoint: sub.endpoint });
    if (!result.ok) throw new Error("Push subscription was not removed");
    await sub.unsubscribe();
  }
  return "off";
}

export async function syncPush(persist: Persist): Promise<void> {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub, persist);
}
