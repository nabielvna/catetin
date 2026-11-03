import { and, eq } from "drizzle-orm";

import { db } from "@/database/client";
import { approvalRequest, approvalVote } from "@/database/schema/approvals";
import { user } from "@/database/schema/auth";
import { obligation } from "@/database/schema/debts";
import { newId } from "@/lib/server/ids";
import { ensureProfile, loadActor } from "@/services/account/profile";
import { type Ctx, ctxFor } from "@/services/context";
import { createObligation, type CreateObligationInput } from "@/services/debts/mutations";
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

export function debt(
  creditor: Ctx | string,
  debtor: Ctx | string,
  amount: number,
  extra: Partial<CreateObligationInput> = {},
): CreateObligationInput {
  const pid = (x: Ctx | string) => (typeof x === "string" ? x : x.actor.partyId);
  return {
    id: newId(),
    creditorId: pid(creditor),
    debtorId: pid(debtor),
    amount,
    currency: "IDR",
    title: "Bensin",
    occurredOn: TODAY,
    ...extra,
  };
}

export async function record(ctx: Ctx, input: CreateObligationInput) {
  return createObligation(ctx, input);
}

export async function obligationRow(id: string) {
  const [row] = await db.select().from(obligation).where(eq(obligation.id, id));
  return row!;
}

export async function pendingFor(ctx: Ctx, targetId: string) {
  const [row] = await db
    .select({ id: approvalRequest.id })
    .from(approvalRequest)
    .innerJoin(approvalVote, eq(approvalVote.requestId, approvalRequest.id))
    .where(
      and(
        eq(approvalRequest.targetId, targetId),
        eq(approvalRequest.status, "PENDING"),
        eq(approvalVote.partyId, ctx.actor.partyId),
      ),
    );
  return row?.id;
}
