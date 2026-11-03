import { createUIMessageStreamResponse } from "ai";

import { isUuid } from "@/lib/server/ids";
import { chatState, chatTurn } from "@/services/assistant/chat";
import { closeThread } from "@/services/assistant/threads";
import { getActor } from "@/services/auth";
export const maxDuration = 60;
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  return Response.json(await chatState(actor, new URL(req.url).searchParams.has("peek")));
}
export async function DELETE(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id && isUuid(id)) await closeThread(actor, id);
  return new Response(null, { status: 204 });
}
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const result = await chatTurn(actor, await req.json().catch(() => null));
  if (!result.ok) return Response.json({ code: result.code, ...result.details }, { status: result.status });
  return createUIMessageStreamResponse({ stream: result.stream });
}
