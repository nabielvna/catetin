"use server";
import { z } from "zod";

import { action } from "@/actions/action";
import { NAME_MAX } from "@/domain/people";
import { deleteAccount } from "@/services/account/delete";
import { updateProfile } from "@/services/account/profile";
import {
  describeDevice,
  signOutDevice as signOutDeviceUseCase,
  signOutOtherDevices as signOutOthersUseCase,
} from "@/services/account/sessions";
import { sendFeedback } from "@/services/account/settings";
import { currentSessionId } from "@/services/auth";
const profileSchema = z.object({
  name: z.string().min(1).max(NAME_MAX).optional(),
  locale: z.enum(["id", "en"]).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  onboarded: z.boolean().optional(),
});

export const saveProfile = action(profileSchema, async (input, ctx) => {
  await updateProfile(ctx.actor, input);
  return { ok: true };
});

export const feedback = action(
  z.object({ message: z.string().min(1).max(5000), context: z.record(z.string(), z.unknown()).optional() }),
  async (input, ctx) => {
    await sendFeedback(ctx.actor, input.message, input.context ?? {});
    return { ok: true };
  },
  { revalidate: false },
);

export const removeAccount = action(
  z.object({ confirm: z.enum(["HAPUS", "DELETE"]) }),
  async (_input, ctx) => {
    await deleteAccount(ctx.actor);
    return { ok: true };
  },
  { revalidate: false },
);

export const signOutDevice = action(z.object({ id: z.uuid() }), async (input, ctx) => {
  await signOutDeviceUseCase(ctx.actor, input.id, await currentSessionId());
  return { ok: true };
});

export const signOutOtherDevices = action(z.object({}), async (_input, ctx) => {
  return { count: await signOutOthersUseCase(ctx.actor, await currentSessionId()) };
});

export const describeThisDevice = action(
  z.object({ model: z.string().max(60).nullable(), browser: z.string().max(40).nullable() }),
  async (input) => {
    await describeDevice(await currentSessionId(), input);
    return { ok: true };
  },
  { rateLimit: false, revalidate: false },
);
