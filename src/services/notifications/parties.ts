import "server-only";

import type { Tx } from "@/database/client";
import type { Ctx } from "@/services/context";
import { activeGroupMemberUserIds } from "@/services/groups/access";
import { enqueue } from "@/services/notifications/enqueue";
import type { NotificationData, NotificationType } from "@/services/notifications/types";
import { getParties, namesFor } from "@/services/people/parties";
import type { Effects } from "@/services/transaction";

export type NotifyPartiesInput = {
  type: NotificationType;

  partyIds: string[];
  activityId?: number | null;
  url: string;
  data?: NotificationData;

  creditorId?: string;
  debtorId?: string;

  counterpartOf?: (recipientPartyId: string) => string | undefined;
  groupName?: string;
  tag?: string;
  dedupeBase?: string;
  includeActor?: boolean;
};

export async function notifyParties(tx: Tx, fx: Effects, ctx: Ctx | null, input: NotifyPartiesInput) {
  const parties = await getParties(tx, input.partyIds);
  const recipients = [];
  for (const partyId of new Set(input.partyIds)) {
    const p = parties.get(partyId);
    if (!p?.userId) continue;
    if (!input.includeActor && ctx && p.userId === ctx.actor.userId) continue;
    const counterpart = input.counterpartOf?.(partyId);
    const nameIds = [ctx?.actor.partyId, counterpart].filter((x): x is string => !!x);
    const names = await namesFor(tx, p.userId, nameIds);
    const data: NotificationData = {};
    if (ctx) data.actorName = names.get(ctx.actor.partyId);
    if (counterpart) data.counterpartName = names.get(counterpart);
    if (input.creditorId && input.debtorId) {
      if (partyId === input.debtorId) data.direction = "I_OWE";
      else if (partyId === input.creditorId) data.direction = "THEY_OWE";
    }
    recipients.push({ userId: p.userId, data });
  }
  await enqueue(tx, fx, {
    type: input.type,
    recipients,
    data: { ...input.data, groupName: input.groupName },
    url: input.url,
    activityId: input.activityId,
    tag: input.tag,
    dedupeBase: input.dedupeBase,
  });
}

export async function refreshScope(
  tx: Tx,
  fx: Effects,
  scope: { partyIds: string[]; groupId?: string | null; pairId?: string | null },
) {
  const parties = await getParties(tx, scope.partyIds);
  const users = [...parties.values()].map((p) => p.userId);
  if (scope.groupId) users.push(...(await activeGroupMemberUserIds(tx, scope.groupId)));
  fx.refreshUsers(users, { scope: "ledger", pairId: scope.pairId ?? undefined, groupId: scope.groupId ?? undefined });
}
