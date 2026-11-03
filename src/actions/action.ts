import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { type ErrorCode, isDomainError } from "@/domain/errors";
import { invalidateUsers } from "@/lib/server/cache-tags";
import { log } from "@/lib/server/logger";
import { consume } from "@/lib/server/rate-limit";
import { requireActor } from "@/services/auth";
import { type Ctx, ctxFor, type Via } from "@/services/context";

const ACTIONS_PER_MINUTE = 60;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; params?: Record<string, string | number>; fields?: Record<string, string[]> };

export function action<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.infer<S>, ctx: Ctx) => Promise<R>,
  opts: {
    via?: Via;

    rateLimit?: boolean;

    revalidate?: boolean;
  } = {},
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const fields: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          (fields[key] ??= []).push(issue.message);
        }
        return { ok: false, code: "INVALID_INPUT", fields };
      }
      const actor = await requireActor();

      if (opts.rateLimit !== false) await consume(`act:${actor.userId}`, ACTIONS_PER_MINUTE, 60);
      const data = await handler(parsed.data, ctxFor(actor, { via: opts.via }));

      if (opts.revalidate !== false) invalidateUsers([actor.userId]);
      return { ok: true, data };
    } catch (e) {
      unstable_rethrow(e);
      if (isDomainError(e)) return { ok: false, code: e.code, params: e.params };
      log.error({ err: e }, "action failed");
      return { ok: false, code: "INTERNAL" };
    }
  };
}
