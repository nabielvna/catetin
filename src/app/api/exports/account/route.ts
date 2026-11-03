import { exportMyData } from "@/services/account/export";
import { getActor } from "@/services/auth";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const data = await exportMyData(actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="catetin-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
