import "server-only";

import { tool, type UIMessage } from "ai";
import { z } from "zod";

export const RESCAN_MAX = 3;

export type Photo = { data: Buffer; mediaType: string };

const isPhoto = (p: UIMessage["parts"][number]) =>
  p.type === "file" && p.mediaType.startsWith("image/") && p.url.startsWith("data:");

export function photosIn(messages: UIMessage[]): Photo[] {
  const out: Photo[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const p of m.parts) {
      if (p.type !== "file" || !isPhoto(p)) continue;
      out.push({ data: Buffer.from(p.url.slice(p.url.indexOf(",") + 1), "base64"), mediaType: p.mediaType });
    }
  }
  return out;
}

export function forModel(messages: UIMessage[]): UIMessage[] {
  let keep = -1;
  messages.forEach((m, i) => {
    if (m.role === "user" && m.parts.some(isPhoto)) keep = i;
  });
  let n = 0;
  return messages.map((m, i) => {
    if (m.role !== "user" || !m.parts.some(isPhoto)) return m;
    const parts = m.parts.flatMap((p) => {
      if (!isPhoto(p)) return [p];
      n++;
      return i === keep
        ? [{ type: "text" as const, text: `[photo #${n}]` }, p]
        : [{ type: "text" as const, text: `[photo #${n}: not resent — rescanPhoto({"photo":${n}}) to see it again]` }];
    });
    return { ...m, parts };
  });
}

function isPastTurn(messages: UIMessage[], toolCallId: string) {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const at = messages.findIndex((m) =>
    m.parts.some((p) => "toolCallId" in p && (p as { toolCallId: string }).toolCallId === toolCallId),
  );
  return at !== -1 && at < lastUser;
}

type RescanOutput = { ok: true; photo: number } | { ok: false; error: "not_found" | "limit" };

export function rescanTool(messages: () => UIMessage[]) {
  let used = 0;
  return tool({
    description: `Look again at a photo the user sent in this chat (number from the [photo #n] tag). Use it when unsure of your reading, the user says something is wrong, or you need an old photo's content. Max ${RESCAN_MAX} times per chat.`,
    inputSchema: z.object({ photo: z.number().int().min(1).max(100) }),
    execute: async ({ photo }): Promise<RescanOutput> => {
      const history = messages();
      const before = history.reduce((s, m) => s + m.parts.filter((p) => p.type === "tool-rescanPhoto").length, 0);
      if (before + used >= RESCAN_MAX) return { ok: false, error: "limit" };
      if (photo > photosIn(history).length) return { ok: false, error: "not_found" };
      used++;
      return { ok: true, photo };
    },
    toModelOutput: ({ toolCallId, output }) => {
      if (!output.ok) return { type: "json", value: output };
      const history = messages();
      const p = photosIn(history)[output.photo - 1];
      if (!p || isPastTurn(history, toolCallId)) {
        return { type: "text", value: `[photo #${output.photo} was already looked at again earlier]` };
      }
      return {
        type: "content",
        value: [
          { type: "text", text: `[photo #${output.photo}]` },
          { type: "file", mediaType: p.mediaType, data: { type: "data", data: p.data.toString("base64") } },
        ],
      };
    },
  });
}
