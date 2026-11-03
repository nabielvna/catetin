"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import {
  removePushSubscription,
  savePushSubscription,
  setDigestFrequency,
  setPref,
  setQuietHours,
} from "@/services/account/settings";
import { currentSessionId } from "@/services/auth";
import { readNotifications as markNotificationsRead } from "@/services/notifications/inbox";
export const setNotificationPref = action(
  z.object({ topic: z.enum(["ACTION", "INFO", "REMINDER"]), channel: z.enum(["PUSH", "EMAIL"]), enabled: z.boolean() }),
  async (input, ctx) => {
    await setPref(ctx.actor, input);
    return { ok: true };
  },
);

export const setDigest = action(z.object({ digest: z.enum(["WEEKLY", "DAILY", "OFF"]) }), async (input, ctx) => {
  await setDigestFrequency(ctx.actor, input.digest);
  return { ok: true };
});

export const setQuiet = action(
  z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }),
  async (input, ctx) => {
    await setQuietHours(ctx.actor, input);
    return { ok: true };
  },
);

export const subscribePush = action(
  z.object({
    endpoint: z.url().max(2000),
    p256dh: z.string().max(200),
    auth: z.string().max(100),
    userAgent: z.string().max(300).nullish(),
  }),
  async (input, ctx) => {
    await savePushSubscription(ctx.actor, input, await currentSessionId());
    return { ok: true };
  },
);

export const unsubscribePush = action(z.object({ endpoint: z.url().max(2000) }), async (input, ctx) => {
  await removePushSubscription(ctx.actor, input.endpoint);
  return { ok: true };
});

export const readNotifications = action(
  z.object({ ids: z.union([z.array(z.uuid()).max(200), z.literal("all")]) }),
  async (input, ctx) => {
    await markNotificationsRead(ctx.actor, input.ids);
    return { ok: true };
  },
  { rateLimit: false },
);
