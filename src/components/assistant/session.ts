"use client";

import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { v7 as uuidv7 } from "uuid";

import type { ReviewEntry, ReviewTool } from "@/components/assistant/review";
import { assistantStore } from "@/components/assistant/store";
import { createStore } from "@/lib/store";
import type { Directory } from "@/services/assistant/types";

export type Quota = { scope: "user" | "app"; resetAt: string };
export type Loaded = Directory & { id: string; messages: UIMessage[]; enabled: boolean; quota: Quota | null };
export type Notice = "disabled" | "busy" | "error" | "voiceEmpty" | "voiceFailed" | "micDenied" | null;

export const session = createStore<{
  data: Loaded | null;
  chat: Chat<UIMessage> | null;
  quota: Quota | null;
  notice: Notice;
  draft: string;
}>({ data: null, chat: null, quota: null, notice: null, draft: "" });

export const handlers = { navigate: (_path: string) => {} };

let currentPath = "/";
export const setCurrentPath = (path: string) => {
  currentPath = path;
};

function screenContext(pathname: string) {
  const m = pathname.match(/^\/(people|groups|debts|payments)\/([0-9a-f-]{36})/);
  return {
    path: pathname,
    partyId: m?.[1] === "people" ? m[2] : undefined,
    groupId: m?.[1] === "groups" ? m[2] : undefined,
    debtId: m?.[1] === "debts" ? m[2] : undefined,
    paymentId: m?.[1] === "payments" ? m[2] : undefined,
  };
}

export const currentScreen = () => screenContext(currentPath);

let loading: Promise<void> | null = null;

export function loadSession(): Promise<void> {
  if (session.get().chat) return Promise.resolve();
  loading ??= fetch("/api/assistant")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: (Omit<Loaded, "id"> & { id: string | null }) | null) => {
      if (d && !session.get().chat) start({ ...d, id: d.id ?? uuidv7() });
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

function start(data: Loaded) {
  const chat: Chat<UIMessage> = new Chat<UIMessage>({
    id: data.id,
    messages: data.messages,
    transport: new DefaultChatTransport({
      api: "/api/assistant",

      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, message: messages.at(-1), screen: screenContext(currentPath) },
      }),
    }),

    sendAutomaticallyWhen: (opts) =>
      lastAssistantMessageIsCompleteWithToolCalls(opts) || lastAssistantMessageIsCompleteWithApprovalResponses(opts),
    onToolCall: ({ toolCall }) => {
      if (toolCall.dynamic) return;
      if (toolCall.toolName === "navigate") {
        handlers.navigate((toolCall.input as { path: string }).path);
        assistantStore.set({ open: false });
        void chat.addToolOutput({
          tool: "navigate" as never,
          toolCallId: toolCall.toolCallId,
          output: { ok: true } as never,
        });
      }
      if (toolCall.toolName === "showTour" || toolCall.toolName === "offerDownload") {
        void chat.addToolOutput({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: { ok: true } as never,
        });
      }
    },
    onError: (e) => {
      const msg = String(e.message ?? "");
      const quota = parseQuota(msg);
      if (quota) return session.set({ quota, notice: null });
      session.set({
        notice: msg.includes("ASSISTANT_DISABLED") ? "disabled" : msg.includes("ASSISTANT_BUSY") ? "busy" : "error",
      });
    },
  });
  session.set({ data, chat, quota: data.quota, notice: null });
}

export async function endSession() {
  const { data } = session.get();
  assistantStore.set({ open: false, active: false });
  session.set({ data: null, chat: null, quota: null, notice: null, draft: "" });

  if (data) await fetch(`/api/assistant?id=${data.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

function parseQuota(msg: string): Quota | null {
  try {
    const body = JSON.parse(msg) as { code?: string } & Partial<Quota>;
    return body.code === "ASSISTANT_QUOTA" && body.scope && body.resetAt
      ? { scope: body.scope, resetAt: body.resetAt }
      : null;
  } catch {
    return null;
  }
}

export function lastPhoto(messages: UIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    for (const p of [...m.parts].reverse()) {
      if (p.type === "file" && p.mediaType.startsWith("image/")) return p.url;
    }
  }
  return undefined;
}

const REVIEW_TOOLS = new Set<string>([
  "draftDebt",
  "draftPayment",
  "draftBill",
  "manageDebt",
  "managePayment",
  "managePerson",
  "manageGroup",
  "updateSettings",
]);

export function pendingReview(id: string): ReviewEntry | null {
  const messages = session.get().chat?.messages ?? [];
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;
  for (const p of last.parts) {
    if (!isToolUIPart(p) || p.toolCallId !== id) continue;
    const tool = getToolName(p);
    if (!REVIEW_TOOLS.has(tool)) return null;
    if (p.state === "input-available" && tool.startsWith("draft")) {
      const wantsPhoto = (p.input as { attachPhoto?: boolean }).attachPhoto;
      return { id, tool: tool as ReviewTool, input: p.input, photo: wantsPhoto ? lastPhoto(messages) : undefined };
    }
    if (p.state === "approval-requested") {
      return { id, tool: tool as ReviewTool, input: p.input, approvalId: p.approval.id };
    }
    return null;
  }
  return null;
}

export function completeReview(entry: ReviewEntry, output?: unknown) {
  const chat = session.get().chat;
  if (!chat || !pendingReview(entry.id)) return;
  if (entry.approvalId) {
    void chat.addToolApprovalResponse({ id: entry.approvalId, approved: true });
    return;
  }
  void chat.addToolOutput({ tool: entry.tool as never, toolCallId: entry.id, output: output as never });
}
