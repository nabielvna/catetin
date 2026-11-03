"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { readNotifications as markNotificationsRead } from "@/services/notifications/inbox";

export const readNotifications = action(
  z.object({ ids: z.union([z.array(z.uuid()).max(200), z.literal("all")]) }),
  async (input, ctx) => {
    await markNotificationsRead(ctx.actor, input.ids);
    return { ok: true };
  },
  { rateLimit: false },
);
