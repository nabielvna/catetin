import { isDomainError } from "@/domain/errors";
import { getActor } from "@/services/auth";
import { MAX_UPLOAD_BYTES, uploadImage } from "@/services/files";

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 100_000) return Response.json({ code: "FILE_REJECTED" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File)) return Response.json({ code: "FILE_REJECTED" }, { status: 400 });
  try {
    const { id } = await uploadImage(actor, Buffer.from(await f.arrayBuffer()));
    return Response.json({ id });
  } catch (e) {
    if (isDomainError(e)) return Response.json({ code: e.code }, { status: 400 });
    throw e;
  }
}
