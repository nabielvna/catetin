import type { Currency } from "@/domain/money";

export type Locale = "id" | "en";

export type Actor = {
  userId: string;
  partyId: string;
  name: string;
  email: string;
  locale: Locale;
  timezone: string;
  currency: Currency;
  onboarded: boolean;
};

import type { Via } from "@/domain/activity";
export type { Via } from "@/domain/activity";

export type Ctx = { actor: Actor; now: Date; via: Via };

export function ctxFor(actor: Actor, opts: { now?: Date; via?: Via } = {}): Ctx {
  return { actor, now: opts.now ?? new Date(), via: opts.via ?? "APP" };
}
