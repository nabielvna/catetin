import "server-only";

import { createHmac } from "node:crypto";

import {
  convertToModelMessages,
  isStepCount,
  safeValidateUIMessages,
  smoothStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { assistantModel, isGoogleRateLimit, isTimeout } from "@/integrations/ai/gemini";
import { env } from "@/lib/server/env";
import { isUuid, newId } from "@/lib/server/ids";
import { log } from "@/lib/server/logger";
import { buildSystemPrompt, contactsFor, groupsFor, replyLang, type ScreenContext } from "@/services/assistant/context";
import { mergeIncoming } from "@/services/assistant/history";
import { approvalPolicy, hasUnexecutedApproval, opTools } from "@/services/assistant/operations";
import { forModel, photosIn, rescanTool } from "@/services/assistant/photos";
import { countModelCall, quotaStatus, refundMessage, takeQuota } from "@/services/assistant/quota";
import { activeThread, loadThread, saveThread } from "@/services/assistant/threads";
import { clientTools, serverTools } from "@/services/assistant/tools";
import type { Actor } from "@/services/context";
const MESSAGES_MAX = 80;
const bodySchema = z.object({
  id: z.string().refine(isUuid),

  message: z.unknown(),
  screen: z
    .object({
      path: z.string().max(300),
      partyId: z.string().optional(),
      groupId: z.string().optional(),
      debtId: z.string().optional(),
      paymentId: z.string().optional(),
    })
    .default({ path: "/" }),
});
export async function chatState(actor: Actor, peek: boolean) {
  if (peek) {
    const t = await activeThread(actor);
    return { active: Array.isArray(t?.messages) && t.messages.length > 0 };
  }
  const [t, contacts, groups, quota] = await Promise.all([
    activeThread(actor),
    contactsFor(actor),
    groupsFor(actor),
    quotaStatus(actor.userId),
  ]);
  return {
    id: t?.id ?? null,
    messages: t?.messages ?? [],
    enabled: Boolean(env().GEMINI_API_KEY),
    quota,
    me: { partyId: actor.partyId, name: actor.name, currency: actor.currency },
    people: contacts.map((c) => ({ id: c.id, name: c.name, state: c.state })),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
  };
}
export async function chatTurn(actor: Actor, body: unknown) {
  const model = assistantModel();
  if (!model) return { ok: false as const, code: "ASSISTANT_DISABLED", status: 503 };

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", status: 400 };

  const contacts = await contactsFor(actor);
  let messages: UIMessage[] = [];
  const ops = opTools(actor, contacts, () => photosIn(messages).map((p) => p.data));
  const tools = {
    ...clientTools,
    ...serverTools(actor, contacts),
    rescanPhoto: rescanTool(() => messages),
    ...ops.tools,
  };
  const incoming = await safeValidateUIMessages({ messages: [parsed.data.message], tools });
  if (!incoming.success) return { ok: false as const, code: "INVALID_INPUT", status: 400 };
  const merged = mergeIncoming(
    (await loadThread(actor, parsed.data.id)) as UIMessage[],
    incoming.data[0]!,
    new Set(Object.keys(clientTools)),
  );
  if (!merged.ok)
    return { ok: false as const, code: merged.code, status: merged.code === "ASSISTANT_STALE" ? 409 : 400 };
  if (merged.messages.length > MESSAGES_MAX) return { ok: false as const, code: "INVALID_INPUT", status: 400 };

  const validated = await safeValidateUIMessages({ messages: merged.messages, tools });
  if (!validated.success) return { ok: false as const, code: "INVALID_INPUT", status: 400 };
  messages = validated.data as UIMessage[];

  const charged = messages.at(-1)?.role === "user";
  const blocked = (await hasUnexecutedApproval(messages, actor.userId)) ? null : await takeQuota(actor.userId, charged);
  if (blocked) return { ok: false as const, code: "ASSISTANT_QUOTA", status: 429, details: blocked };
  const screen = parsed.data.screen as ScreenContext;
  const turn = newTurnLog(actor.userId, parsed.data.id, charged);
  const policy = approvalPolicy(ops.env);

  const result = streamText({
    model,
    system: await buildSystemPrompt(actor, screen, contacts, { lang: replyLang(messages, actor.locale) }),

    messages: await convertToModelMessages(forModel(messages), { tools, ignoreIncompleteToolCalls: true }),
    tools,

    toolApproval: async (opts) => {
      const r = await policy(opts);
      if (typeof r === "object" && r?.type === "denied") turn.denied.push(opts.toolCall.toolName);
      return r;
    },
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(6),

    timeout: { stepMs: 25_000, totalMs: 55_000 },
    temperature: 0.2,
    onLanguageModelCallStart: () =>
      countModelCall(actor.userId).catch((err) => log.error({ err }, "assistant quota count failed")),
    onLanguageModelCallEnd: (e) => {
      turn.calls.push({
        in: e.usage.inputTokens,
        cached: e.usage.inputTokenDetails.cacheReadTokens,
        out: e.usage.outputTokens,
        ms: Math.round(e.performance.responseTimeMs),
        finish: e.finishReason,
        tools: e.content.flatMap((c) => (c.type === "tool-call" ? [c.toolName] : [])),
      });
    },
    onEnd: () => log.info(turnSummary(turn), "assistant turn"),
    experimental_transform: smoothStream({ chunking: "word" }),
    onError: ({ error }) => log.error({ err: error, ...turnSummary(turn) }, "assistant stream error"),
  });

  let refunded = false;
  return {
    ok: true as const,
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,

      generateMessageId: newId,
      onError: (error) => {
        if (!isGoogleRateLimit(error) && !isTimeout(error)) return "ASSISTANT_ERROR";

        if (charged && !refunded) {
          refunded = true;
          refundMessage(actor.userId).catch((err) => log.error({ err }, "assistant quota refund failed"));
        }
        return "ASSISTANT_BUSY";
      },
      onEnd: async ({ messages: all }) => {
        await saveThread(actor, parsed.data.id, all).catch((err) => log.error({ err }, "save thread failed"));
      },
    }),
  };
}
function approvalSecret() {
  return createHmac("sha256", env().SIGNING_SECRET).update("assistant-tool-approval").digest();
}
function newTurnLog(userId: string, threadId: string, newMessage: boolean) {
  return {
    userId,
    threadId,
    newMessage,
    started: Date.now(),
    calls: [] as Array<{ in?: number; cached?: number; out?: number; ms: number; finish: string; tools: string[] }>,
    denied: [] as string[],
  };
}
function turnSummary(t: ReturnType<typeof newTurnLog>) {
  const sum = (k: "in" | "cached" | "out") => t.calls.reduce((s, c) => s + (c[k] ?? 0), 0);
  return {
    userId: t.userId,
    threadId: t.threadId,
    newMessage: t.newMessage,
    steps: t.calls.length,
    tools: t.calls.flatMap((c) => c.tools),
    denied: t.denied,
    tokensIn: sum("in"),
    tokensCached: sum("cached"),
    tokensOut: sum("out"),
    ms: Date.now() - t.started,
    calls: t.calls,
  };
}
