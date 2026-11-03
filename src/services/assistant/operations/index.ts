import "server-only";

import { isToolUIPart, tool, type ToolApprovalStatus, type UIMessage } from "ai";
import type { z } from "zod";

import { DomainError, isDomainError } from "@/domain/errors";
import { log } from "@/lib/server/logger";
import { consume, increment, peek } from "@/lib/server/rate-limit";
import type { Contact } from "@/services/assistant/context";
import { respondRequest, respondRequestInput } from "@/services/assistant/operations/approvals";
import { manageDebt, manageDebtInput } from "@/services/assistant/operations/debts";
import { manageGroup, manageGroupInput } from "@/services/assistant/operations/groups";
import { errorOutput, makeEnv } from "@/services/assistant/operations/helpers";
import { managePayment, managePaymentInput } from "@/services/assistant/operations/payments";
import { managePerson, managePersonInput } from "@/services/assistant/operations/people";
import { updateSettings, updateSettingsInput } from "@/services/assistant/operations/settings";
import { type Env, type Op, type OpOutput } from "@/services/assistant/operations/types";
import { type Actor, ctxFor } from "@/services/context";

export type { OpOutput, Preview, Review, Undo } from "@/services/assistant/operations/types";

const ACTIONS_PER_MINUTE = 60;

const EXECUTED_TTL = 2 * 86_400;

const executedKey = (userId: string, toolCallId: string) => `ai:op:${userId}:${toolCallId}`;

const OPS = {
  manageDebt: {
    schema: manageDebtInput,
    op: manageDebt,
    description:
      "Edit, delete, forgive, label, stop a recurring debt, or attach a proof photo to an EXISTING debt. The user confirms via a card.",
  },
  managePayment: {
    schema: managePaymentInput,
    op: managePayment,
    description:
      "Cancel a payment, offset debts with one person, or attach a photo to a payment. The user confirms via a card.",
  },
  respondRequest: {
    schema: respondRequestInput,
    op: respondRequest,
    description:
      "Approve/reject requests (many at once is fine), withdraw my request, dispute a mutual-trust action, or mark notifications read. Take ids from getInbox.",
  },
  managePerson: {
    schema: managePersonInput,
    op: managePerson,
    description:
      "Manage people/contacts: add, rename, email, mutual trust, block, merge, archive, delete, remind (ask to pay), invite link.",
  },
  manageGroup: {
    schema: manageGroupInput,
    op: manageGroup,
    description:
      "Manage groups: create, add/remove members, accept/decline invites, rename, roles, leave, mode, archive, simplify debts, invite link.",
  },
  updateSettings: {
    schema: updateSettingsInput,
    op: updateSettings,
    description:
      "Update profile (name, language, currency, time zone), notifications, email digest, quiet hours, or send feedback.",
  },
} as const;

export type OpToolName = keyof typeof OPS;
export const OP_TOOLS = Object.keys(OPS) as OpToolName[];

export function isOpTool(name: string): name is OpToolName {
  return Object.hasOwn(OPS, name);
}

export async function runOp(name: OpToolName, input: unknown, env: Env, toolCallId?: string): Promise<OpOutput> {
  const { op } = OPS[name] as { op: Op<unknown> };
  const review = op.review?.(input, env);
  if (review) return { ok: true, reviewed: true, summary: env.t("done.reviewed"), href: review.view };
  try {
    if (toolCallId && (await increment(executedKey(env.actor.userId, toolCallId), EXECUTED_TTL)) > 1) {
      throw new DomainError("ALREADY_DECIDED");
    }
    await consume(`act:${env.actor.userId}`, ACTIONS_PER_MINUTE, 60);
    const r = await op.run(input, ctxFor(env.actor, { via: "ASSISTANT" }), env);
    return { ok: true, ...r };
  } catch (e) {
    if (!isDomainError(e)) log.error({ err: e, tool: name }, "assistant op failed");
    return errorOutput(e, env.actor.locale);
  }
}

export function approvalPolicy(env: Env) {
  return async ({ toolCall }: { toolCall: { toolName: string; input: unknown } }): Promise<ToolApprovalStatus> => {
    if (!isOpTool(toolCall.toolName)) return undefined;
    const { op } = OPS[toolCall.toolName] as { op: Op<unknown> };
    try {
      const preview = await op.preview(toolCall.input, env);
      if (preview === "auto") return "not-applicable";
      const review = op.review?.(toolCall.input, env);
      return { type: "user-approval", reason: JSON.stringify(review ? { ...preview, review: review.form } : preview) };
    } catch (e) {
      if (!isDomainError(e)) log.error({ err: e, tool: toolCall.toolName }, "assistant preview failed");
      return { type: "denied", reason: errorOutput(e, env.actor.locale).message };
    }
  };
}

function opTool<S extends z.ZodType>(name: OpToolName, schema: S, env: Env) {
  return tool({
    description: OPS[name].description,
    inputSchema: schema,
    execute: (input: z.infer<S>, { toolCallId }: { toolCallId: string }) => runOp(name, input, env, toolCallId),
  });
}

export function opTools(actor: Actor, contacts: Contact[], images: () => Buffer[] = () => []) {
  const env = makeEnv(actor, contacts, images);
  return {
    env,
    tools: {
      manageDebt: opTool("manageDebt", manageDebtInput, env),
      managePayment: opTool("managePayment", managePaymentInput, env),
      respondRequest: opTool("respondRequest", respondRequestInput, env),
      managePerson: opTool("managePerson", managePersonInput, env),
      manageGroup: opTool("manageGroup", manageGroupInput, env),
      updateSettings: opTool("updateSettings", updateSettingsInput, env),
    },
  };
}

export async function hasUnexecutedApproval(messages: UIMessage[], userId: string): Promise<boolean> {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return false;
  for (const p of last.parts) {
    if (!isToolUIPart(p) || p.state !== "approval-responded" || !p.approval.approved) continue;
    if ((await peek(executedKey(userId, p.toolCallId))) === 0) return true;
  }
  return false;
}

const UNDOABLE: Partial<Record<OpToolName, string[]>> = {
  managePerson: ["TRUST", "UNTRUST", "BLOCK", "UNBLOCK", "ARCHIVE", "UNARCHIVE"],
  updateSettings: ["PROFILE", "NOTIFICATION", "DIGEST"],
};

export function parseUndo(toolName: string, input: unknown): { name: OpToolName; input: unknown } | null {
  if (!isOpTool(toolName)) return null;
  const parsed = OPS[toolName].schema.safeParse(input);
  if (!parsed.success) return null;
  const action = (parsed.data as { action: string; locale?: string }).action;
  if (!UNDOABLE[toolName]?.includes(action)) return null;
  const data = parsed.data as { locale?: string; name?: string };
  if (data.locale !== undefined || data.name !== undefined) return null;
  return { name: toolName, input: parsed.data };
}

export { makeEnv };
