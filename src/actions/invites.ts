"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { requestAppUrl } from "@/lib/server/app-url";
import { acceptInvite, createInvite, revokeInvite } from "@/services/invites";

const uuid = z.uuid();

export const makeInvite = action(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("CLAIM"), partyId: uuid, sendEmail: z.boolean().optional() }),
    z.object({ kind: z.literal("CONNECT") }),
    z.object({ kind: z.literal("GROUP"), groupId: uuid }),
  ]),
  async (input, ctx) => {
    const inv = await createInvite(ctx, input);

    return { url: `${await requestAppUrl()}/invite/${inv.token}`, expiresAt: inv.expiresAt.toISOString() };
  },

  { revalidate: false },
);

export const cancelInvites = action(z.object({ partyId: uuid.optional(), groupId: uuid.optional() }), (input, ctx) =>
  revokeInvite(ctx, input),
);

export const accept = action(
  z.object({ token: z.string().min(20).max(100), disputedObligationIds: z.array(uuid).max(500).optional() }),
  (input, ctx) => acceptInvite(ctx, input),
);
