import "server-only";

import postgres from "postgres";

import { rawSql } from "@/database/client";
import { PG_CHANNEL, type RealtimeMessage } from "@/integrations/realtime/types";
import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

type Client = (message: RealtimeMessage) => void;

class Hub {
  private clients = new Map<string, Set<Client>>();
  private started: Promise<void> | null = null;

  private start() {
    if (this.started) return this.started;
    const sql = postgres(env().DATABASE_URL, { max: 1, onnotice: () => {} });
    this.started = sql
      .listen(PG_CHANNEL, (payload) => {
        try {
          const { u, m } = JSON.parse(payload) as { u: string[]; m: RealtimeMessage };
          for (const userId of u) this.clients.get(userId)?.forEach((send) => send(m));
        } catch (err) {
          log.warn({ err }, "bad realtime payload");
        }
      })
      .then(() => undefined);
    return this.started;
  }

  async subscribe(userId: string, client: Client): Promise<() => void> {
    await this.start();
    const set = this.clients.get(userId) ?? new Set();
    set.add(client);
    this.clients.set(userId, set);
    return () => {
      set.delete(client);
      if (set.size === 0) this.clients.delete(userId);
    };
  }
}

const g = globalThis as unknown as { __catetinHub?: Hub };
export const hub = (g.__catetinHub ??= new Hub());

export async function publishPostgres(users: string[], message: RealtimeMessage): Promise<void> {
  for (let i = 0; i < users.length; i += 100) {
    const payload = JSON.stringify({ u: users.slice(i, i + 100), m: message });
    await rawSql()`select pg_notify(${PG_CHANNEL}, ${payload})`;
  }
}
