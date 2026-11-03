"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { DomainError } from "@/domain/errors";
import { learnPersonAlias } from "@/services/assistant/context";
import { makeEnv, parseUndo, runOp } from "@/services/assistant/operations";

const uuid = z.uuid();

const opts = { via: "ASSISTANT" as const };

export const learnAlias = action(z.object({ partyId: uuid, alias: z.string().min(1).max(60) }), async (input, ctx) => {
  await learnPersonAlias(ctx.actor, input);
  return { ok: true };
});

export const undoAssistantAction = action(
  z.object({ tool: z.string().max(40), input: z.record(z.string(), z.unknown()) }),
  async (input, ctx) => {
    const undo = parseUndo(input.tool, input.input);
    if (!undo) throw new DomainError("INVALID_INPUT");
    const r = await runOp(undo.name, undo.input, makeEnv(ctx.actor, []));
    if (!r.ok) throw new DomainError(r.code);
    return { ok: true };
  },
  { ...opts, rateLimit: false },
);
