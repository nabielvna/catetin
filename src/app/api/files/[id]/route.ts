import { isUuid } from "@/lib/server/ids";
import { getActor } from "@/services/auth";
import { readFileFor } from "@/services/files";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const data = await readFileFor(actor, id);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
