import { isDomainError } from "@/domain/errors";
import { assistantModel, isGoogleRateLimit } from "@/integrations/ai/gemini";
import { log } from "@/lib/server/logger";
import { consume } from "@/lib/server/rate-limit";
import { countModelCall, quotaStatus } from "@/services/assistant/quota";
import { MAX_AUDIO_BYTES, transcribe } from "@/services/assistant/transcribe";
import { getActor } from "@/services/auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const model = assistantModel();
  if (!model) return Response.json({ code: "ASSISTANT_DISABLED" }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + 100_000) {
    return Response.json({ code: "FILE_REJECTED" }, { status: 413 });
  }
  const blocked = await quotaStatus(actor.userId);
  if (blocked) return Response.json({ code: "ASSISTANT_QUOTA", ...blocked }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return Response.json({ code: "FILE_REJECTED" }, { status: 400 });
  try {
    await consume(`ai:stt:${actor.userId}`, 20, 60);
    await countModelCall(actor.userId);
    const text = await transcribe(actor, new Uint8Array(await file.arrayBuffer()), file.type, model);
    return Response.json({ text });
  } catch (e) {
    if (isDomainError(e)) return Response.json({ code: e.code }, { status: e.code === "RATE_LIMITED" ? 429 : 400 });
    if (isGoogleRateLimit(e)) return Response.json({ code: "ASSISTANT_BUSY" }, { status: 503 });
    log.error({ err: e }, "assistant transcribe failed");
    return Response.json({ code: "ASSISTANT_ERROR" }, { status: 500 });
  }
}
