import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/database/client";
import { db } from "@/database/client";
import { party, profile, user } from "@/database/schema/index";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { type Currency, isCurrency } from "@/domain/money";
import { normalizeName } from "@/domain/people";
import { newId } from "@/lib/server/ids";
import type { Actor, Locale } from "@/services/context";
import { mutate } from "@/services/transaction";

export type ProfileRow = typeof profile.$inferSelect;

export async function ensureProfile(
  tx: DbOrTx,
  u: { id: string; name: string; email: string },
  defaults: { timezone?: string; currency?: string } = {},
): Promise<ProfileRow> {
  const [existing] = await tx.select().from(profile).where(eq(profile.userId, u.id));
  if (existing) return existing;
  const partyId = newId();
  await tx
    .insert(party)
    .values({ id: partyId, kind: "USER", userId: u.id, displayName: u.name?.trim() || u.email.split("@")[0]! })
    .onConflictDoNothing();
  const [p] = await tx.select().from(party).where(eq(party.userId, u.id));
  const timezone = defaults.timezone && isValidTimezone(defaults.timezone) ? defaults.timezone : DEFAULT_TIMEZONE;
  const currency = defaults.currency && isCurrency(defaults.currency) ? defaults.currency : "IDR";
  const [row] = await tx
    .insert(profile)
    .values({ userId: u.id, partyId: p!.id, timezone, currency })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [again] = await tx.select().from(profile).where(eq(profile.userId, u.id));
  return again!;
}

export async function loadActor(userId: string, tx: DbOrTx = db): Promise<Actor | null> {
  const [row] = await tx
    .select({
      userId: user.id,
      email: user.email,
      name: party.displayName,
      partyId: profile.partyId,
      locale: user.locale,
      timezone: profile.timezone,
      currency: profile.currency,
      onboardedAt: user.onboardedAt,
    })
    .from(user)
    .innerJoin(profile, eq(profile.userId, user.id))
    .innerJoin(party, eq(party.id, profile.partyId))
    .where(eq(user.id, userId));
  if (!row) return null;
  return {
    userId: row.userId,
    partyId: row.partyId,
    name: row.name,
    email: row.email,
    locale: (row.locale === "en" ? "en" : "id") as Locale,
    timezone: row.timezone,
    currency: row.currency as Currency,
    onboarded: row.onboardedAt !== null,
  };
}

export async function updateProfile(
  actor: Actor,
  input: { name?: string; locale?: string; timezone?: string; currency?: string; onboarded?: boolean },
) {
  await mutate(async (tx, fx) => {
    if (input.name !== undefined) {
      const name = normalizeName(input.name);
      await tx.update(party).set({ displayName: name, updatedAt: new Date() }).where(eq(party.id, actor.partyId));
      await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, actor.userId));
    }
    const userSet: Partial<typeof user.$inferInsert> = {};
    if (input.locale !== undefined) {
      if (input.locale !== "id" && input.locale !== "en") throw new DomainError("INVALID_INPUT", { field: "locale" });
      userSet.locale = input.locale;
    }
    if (input.onboarded) userSet.onboardedAt = new Date();
    if (Object.keys(userSet).length) {
      await tx
        .update(user)
        .set({ ...userSet, updatedAt: new Date() })
        .where(eq(user.id, actor.userId));
    }
    const set: Partial<typeof profile.$inferInsert> = {};
    if (input.timezone !== undefined) {
      if (!isValidTimezone(input.timezone)) throw new DomainError("INVALID_INPUT", { field: "timezone" });
      set.timezone = input.timezone;
    }
    if (input.currency !== undefined) {
      if (!isCurrency(input.currency)) throw new DomainError("INVALID_INPUT", { field: "currency" });
      set.currency = input.currency;
    }
    if (Object.keys(set).length) await tx.update(profile).set(set).where(eq(profile.userId, actor.userId));
    fx.refreshUsers([actor.userId], { scope: "profile" });
  });
}
