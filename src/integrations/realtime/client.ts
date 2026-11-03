"use client";
type TokenInfo =
  { driver: "pg" | "none" } | { driver: "supabase"; url: string; anonKey: string; token: string; topic: string };

export function subscribeChanges(refresh: () => void) {
  let closed = false;
  let cleanupConn = () => {};
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connectSse = () => {
    let es: EventSource | null = null;
    let retry = 1000;
    const open = () => {
      if (closed) return;
      es = new EventSource("/api/realtime");
      es.addEventListener("change", refresh);
      es.onopen = () => {
        retry = 1000;
      };
      es.onerror = () => {
        es?.close();
        retryTimer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    open();
    cleanupConn = () => {
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  };

  const connectSupabase = async (info: Extract<TokenInfo, { driver: "supabase" }>) => {
    const { createClient } = await import("@supabase/supabase-js");
    if (closed) return;
    // Realtime asks the client for its token again after joining and reconnecting.
    // Catetin uses Better Auth, so Supabase Auth has no session to supply here.
    let accessToken = info.token;
    const client = createClient(info.url, info.anonKey, { accessToken: async () => accessToken });
    await client.realtime.setAuth(info.token);
    if (closed) {
      client.realtime.disconnect();
      return;
    }
    const channel = client
      .channel(info.topic, { config: { private: true } })
      .on("broadcast", { event: "change" }, refresh)
      .subscribe();

    const renew = setInterval(async () => {
      try {
        const next = (await fetch("/api/realtime/token").then((r) => r.json())) as TokenInfo;
        if (!closed && next.driver === "supabase") {
          accessToken = next.token;
          await client.realtime.setAuth(accessToken);
        }
      } catch {}
    }, 50 * 60_000);
    cleanupConn = () => {
      clearInterval(renew);
      void client.removeChannel(channel);
    };
  };

  void fetch("/api/realtime/token")
    .then((r) => (r.ok ? (r.json() as Promise<TokenInfo>) : ({ driver: "none" } as TokenInfo)))
    .then(async (info) => {
      if (closed) return;
      if (info.driver === "supabase") await connectSupabase(info);
      else if (info.driver === "pg") connectSse();
    })
    .catch(() => {});

  return () => {
    closed = true;
    cleanupConn();
  };
}
