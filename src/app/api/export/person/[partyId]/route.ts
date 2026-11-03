import { GET as exportPerson } from "@/app/api/exports/people/[id]/route";
export async function GET(req: Request, ctx: { params: Promise<{ partyId: string }> }) {
  return exportPerson(req, { params: ctx.params.then(({ partyId }) => ({ id: partyId })) });
}
