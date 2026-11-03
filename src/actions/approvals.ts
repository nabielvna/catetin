"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { cancelRequest, decideRequest } from "@/services/approvals/decisions";
import { disputeTrustAction } from "@/services/approvals/disputes";

const uuid = z.uuid();

export const decide = action(
  z.object({ requestId: uuid, decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().max(500).nullish() }),
  (input, ctx) => decideRequest(ctx, input),
);

export const decideMany = action(
  z.object({ requestIds: z.array(uuid).min(1).max(50), decision: z.enum(["APPROVE", "REJECT"]) }),
  async (input, ctx) => {
    const results = await Promise.allSettled(
      input.requestIds.map((requestId) => decideRequest(ctx, { requestId, decision: input.decision })),
    );
    return {
      ok: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);

export const dispute = action(z.object({ id: uuid, reason: z.string().max(500).nullish() }), (input, ctx) =>
  disputeTrustAction(ctx, input),
);

export const cancel = action(z.object({ requestId: uuid }), (input, ctx) => cancelRequest(ctx, input));
