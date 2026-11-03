import "server-only";

import { getToolName, isToolUIPart, type UIMessage } from "ai";

import { SCAN_MAX_PHOTOS } from "@/domain/receipt";

const TEXT_MAX = 4000;
const PHOTO_URL_MAX = 6_000_000;

type Part = UIMessage["parts"][number];
export type Merge = { ok: true; messages: UIMessage[] } | { ok: false; code: "INVALID_INPUT" | "ASSISTANT_STALE" };

export function mergeIncoming(stored: UIMessage[], incoming: UIMessage, clientTools: ReadonlySet<string>): Merge {
  if (incoming.role === "user") {
    if (stored.some((m) => m.id === incoming.id) || !validUserParts(incoming.parts)) {
      return { ok: false, code: "INVALID_INPUT" };
    }
    return { ok: true, messages: [...stored, { id: incoming.id, role: "user", parts: incoming.parts }] };
  }
  const last = stored.at(-1);

  const sameMessage = last?.id === incoming.id || last?.id === "";
  if (incoming.role !== "assistant" || !last || last.role !== "assistant" || !sameMessage) {
    return { ok: false, code: "ASSISTANT_STALE" };
  }
  const fromClient = new Map(incoming.parts.filter(isToolUIPart).map((p) => [p.toolCallId, p]));
  const parts = last.parts.map((p): Part => {
    if (!isToolUIPart(p)) return p;
    const c = fromClient.get(p.toolCallId);
    if (!c) return p;

    if (p.state === "approval-requested" && c.state === "approval-responded" && c.approval.id === p.approval.id) {
      return {
        ...p,
        state: "approval-responded",
        approval: { ...p.approval, approved: c.approval.approved, reason: c.approval.reason },
      } as Part;
    }

    if (p.state === "input-available" && clientTools.has(getToolName(p))) {
      if (c.state === "output-available") return { ...p, state: "output-available", output: c.output } as Part;
      if (c.state === "output-error") return { ...p, state: "output-error", errorText: c.errorText } as Part;
    }
    return p;
  });
  return { ok: true, messages: [...stored.slice(0, -1), { ...last, id: incoming.id, parts }] };
}

function validUserParts(parts: Part[]) {
  let photos = 0;
  for (const p of parts) {
    if (p.type === "text" && p.text.length <= TEXT_MAX) continue;
    if (
      p.type === "file" &&
      p.mediaType.startsWith("image/") &&
      p.url.startsWith("data:image/") &&
      p.url.length <= PHOTO_URL_MAX &&
      ++photos <= SCAN_MAX_PHOTOS
    ) {
      continue;
    }
    return false;
  }
  return parts.length > 0;
}
