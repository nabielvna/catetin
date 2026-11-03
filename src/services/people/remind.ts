import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { notification, obligation } from "@/database/schema/index";
import { todayIn } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { notifyParties } from "@/services/notifications/parties";
import { assertNotBlocked } from "@/services/people/blocks";
import { findPair, getParty } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export function remindPerson(ctx: Ctx, input: { partyId: string }): Promise<{ sent: boolean }> {
  return mutate(async (tx, fx) => {
    const other = await getParty(tx, input.partyId);
    const pair = await findPair(tx, ctx.actor.partyId, other.id);
    if (!pair) throw new DomainError("NOT_FOUND");
    await assertNotBlocked(tx, ctx.actor.partyId, [other.id]);
    const rows = await tx
      .select({
        currency: obligation.currency,
        total: sql<string>`sum(${obligation.amount} - ${obligation.paid})`,
        n: sql<number>`count(*)::int`,
        title: sql<string>`min(${obligation.title})`,
      })
      .from(obligation)
      .where(
        and(
          eq(obligation.pairId, pair.id),
          eq(obligation.creditorId, ctx.actor.partyId),
          eq(obligation.status, "ACTIVE"),
          gt(sql`${obligation.amount} - ${obligation.paid}`, 0),
        ),
      )
      .groupBy(obligation.currency);
    if (rows.length === 0) throw new DomainError("INVALID_STATE");
    const main = rows.sort((a, b) => Number(b.total) - Number(a.total))[0]!;
    const today = todayIn(ctx.actor.timezone, ctx.now);
    const dedupe = `manual:${pair.id}:${today}`;

    const [already] = await tx
      .select({ id: notification.id })
      .from(notification)
      .where(sql`${notification.dedupeKey} like ${dedupe + ":%"}`)
      .limit(1);
    if (already) throw new DomainError("RATE_LIMITED");

    const data = {
      amount: Number(main.total),
      currency: main.currency as Currency,
      title: main.n > 1 ? `${main.n}×` : main.title,
    };
    if (other.userId) {
      await notifyParties(tx, fx, ctx, {
        type: "MANUAL_REMINDER",
        partyIds: [other.id],
        url: `/people/${ctx.actor.partyId}`,
        data,
        dedupeBase: dedupe,
      });
    } else if (other.kind === "MANUAL" && other.email) {
      await tx
        .insert(notification)
        .values({
          id: newId(),
          type: "MANUAL_REMINDER",
          recipientEmail: other.email,
          channel: "EMAIL",
          dedupeKey: `${dedupe}:EMAIL`,
          payload: {
            type: "MANUAL_REMINDER",
            url: "/",
            data: { ...data, actorName: ctx.actor.name, locale: ctx.actor.locale },
          } as never,
          status: "PENDING",
        });
      fx.dispatch = true;
    } else {
      throw new DomainError("INVALID_STATE");
    }
    await recordActivity(tx, ctx, { type: "REMINDER_SENT", pairId: pair.id, data });
    return { sent: true };
  });
}
