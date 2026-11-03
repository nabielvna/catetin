import { hub } from "@/integrations/realtime/postgres";
import { env } from "@/lib/server/env";
import { getActor } from "@/services/auth";

export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  if (env().REALTIME_DRIVER !== "pg") return new Response(null, { status: 204 });

  const encoder = new TextEncoder();
  let closed = false;
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const heartbeat = setInterval(() => write(`: ping\n\n`), 25_000);
      let unsubscribe = () => {};
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      cleanup = stop;
      req.signal.addEventListener("abort", stop, { once: true });

      send("ready", {});
      const unsub = await hub.subscribe(actor.userId, (m) => send("change", m));
      if (closed) return unsub();
      unsubscribe = unsub;
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}
