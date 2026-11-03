"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { NAME_MAX } from "@/domain/people";
import { updateProfile } from "@/services/account/profile";

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
