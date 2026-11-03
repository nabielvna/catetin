import { isDomainError } from "@/domain/errors";
import { isCurrency } from "@/domain/money";
import { SCAN_MAX_PHOTOS } from "@/domain/receipt";
import { assistantModel, isGoogleRateLimit } from "@/integrations/ai/gemini";
import { log } from "@/lib/server/logger";
import { consume } from "@/lib/server/rate-limit";
import { countModelCall, quotaStatus } from "@/services/assistant/quota";
import { getActor } from "@/services/auth";
import { SCAN_MAX_BYTES, type ScanPurpose, scanReceipt } from "@/services/scan";

export const maxDuration = 30;

const PURPOSES: ScanPurpose[] = ["bill", "debt", "payment"];

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const model = assistantModel();
  if (!model) return Response.json({ code: "ASSISTANT_DISABLED" }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > SCAN_MAX_PHOTOS * SCAN_MAX_BYTES + 100_000) {
    return Response.json({ code: "FILE_REJECTED" }, { status: 413 });
  }
  const blocked = await quotaStatus(actor.userId);
  if (blocked) return Response.json({ code: "ASSISTANT_QUOTA", ...blocked }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const photos = form?.getAll("photo").filter((f): f is File => f instanceof File) ?? [];
  const purpose = form?.get("purpose");
  const currency = String(form?.get("currency") ?? "");
  if (photos.length === 0 || !PURPOSES.includes(purpose as ScanPurpose)) {
    return Response.json({ code: "FILE_REJECTED" }, { status: 400 });
  }
  try {
    await consume(`ai:scan:${actor.userId}`, 10, 60);
    await countModelCall(actor.userId);
    const receipt = await scanReceipt(
      actor,
      await Promise.all(photos.map(async (f) => new Uint8Array(await f.arrayBuffer()))),
      purpose as ScanPurpose,
      isCurrency(currency) ? currency : actor.currency,
      model,
    );
    return Response.json({ receipt });
  } catch (e) {
    if (isDomainError(e)) return Response.json({ code: e.code }, { status: e.code === "RATE_LIMITED" ? 429 : 400 });
    if (isGoogleRateLimit(e)) return Response.json({ code: "ASSISTANT_BUSY" }, { status: 503 });
    log.error({ err: e }, "receipt scan failed");
    return Response.json({ code: "SCAN_FAILED" }, { status: 500 });
  }
}
