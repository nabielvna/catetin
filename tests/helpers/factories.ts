import { db } from "@/database/client";
import { user } from "@/database/schema/index";
import { newId } from "@/lib/server/ids";
import { ensureProfile, loadActor } from "@/services/account/profile";
import { type Ctx, ctxFor } from "@/services/context";
import { createManualContact } from "@/services/people/mutations";
import { ensurePair } from "@/services/people/parties";

export const TODAY = "2026-09-27";

let counter = 0;

export async function makeUser(name: string): Promise<Ctx> {
  const id = newId();
  counter += 1;
  await db
    .insert(user)
    .values({ id, name, email: `${name.toLowerCase()}.${counter}.${id.slice(-6)}@test.local`, emailVerified: true });
  await ensureProfile(db, { id, name, email: `${name}@test.local` });
  const actor = await loadActor(id);
  if (!actor) throw new Error("actor missing");
  return ctxFor(actor);
}

export async function connected(a: Ctx, b: Ctx): Promise<string> {
  const pair = await db.transaction((tx) => ensurePair(tx, a.actor.partyId, b.actor.partyId));
  return pair.id;
}

export async function manual(ctx: Ctx, name: string, email?: string) {
  return createManualContact(ctx, { id: newId(), name, email });
}
