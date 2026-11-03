import { isUuid } from "@/lib/server/ids";
import { getActor } from "@/services/auth";
import { exportPersonCsv } from "@/services/exports";

export async function GET(_req: Request, ctx: RouteContext<"/api/exports/people/[id]">) {
  const { id: partyId } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  if (!isUuid(partyId)) return new Response(null, { status: 404 });
  const data = await exportPersonCsv(actor, partyId);
  if (!data) return new Response(null, { status: 404 });
  return new Response(data.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="catetin-${data.name}.csv"`,
      "cache-control": "no-store",
    },
  });
}
