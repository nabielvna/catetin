import { runNotifications } from "@/jobs/notifications";
import { isCronAuthorized } from "@/lib/server/cron";
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return new Response(null, { status: 401 });
  return Response.json(await runNotifications());
}
export const GET = POST;
