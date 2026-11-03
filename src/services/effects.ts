import "server-only";

import { after } from "next/server";

import { publish, type RealtimeMessage } from "@/integrations/realtime/server";
import { invalidateUsers } from "@/lib/server/cache-tags";
import { log } from "@/lib/server/logger";
import { dispatchPending } from "@/services/notifications/dispatch";

export class Effects {
  private readonly refresh = new Map<string, { users: Set<string>; message: RealtimeMessage }>();
  dispatch = false;

  refreshUsers(userIds: Iterable<string | null | undefined>, message: RealtimeMessage) {
    const key = JSON.stringify(message);
    const entry = this.refresh.get(key) ?? { users: new Set<string>(), message };
    for (const userId of userIds) if (userId) entry.users.add(userId);
    this.refresh.set(key, entry);
  }

  async flush(): Promise<void> {
    const entries = [...this.refresh.values()];
    try {
      invalidateUsers(entries.flatMap(({ users }) => [...users]));
    } catch (err) {
      log.warn({ err }, "post-commit cache invalidation failed");
    }
    const results = await Promise.allSettled(entries.map(({ users, message }) => publish(users, message)));
    for (const result of results)
      if (result.status === "rejected") log.warn({ err: result.reason }, "post-commit realtime failed");
    if (!this.dispatch) return;
    const deliver = async () => {
      try {
        await dispatchPending({ limit: 50 });
      } catch (err) {
        log.error({ err }, "notification dispatch failed");
      }
    };
    try {
      after(deliver);
    } catch {
      log.debug("notifications deferred to scheduled dispatch");
    }
  }
}
