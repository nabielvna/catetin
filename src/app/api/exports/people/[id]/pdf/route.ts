import { todayIn } from "@/domain/dates";
import { statementPdf } from "@/integrations/pdf/statement";
import { isUuid } from "@/lib/server/ids";
import { getActor } from "@/services/auth";
import { getPerson } from "@/services/people/queries";

export async function GET(_req: Request, ctx: RouteContext<"/api/exports/people/[id]/pdf">) {
  const { id: partyId } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  if (!isUuid(partyId)) return new Response(null, { status: 404 });
  const data = await getPerson(actor, partyId);
  if (!data) return new Response(null, { status: 404 });
  const today = todayIn(actor.timezone, new Date());
  const pdf = await statementPdf({
    locale: actor.locale,
    me: actor.name,
    name: data.header.name,
    today,
    entries: data.entries,
    net: data.header.net,
  });
  const name = data.header.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="catetin-${name}-${today}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
