import "server-only";

import { createTranslator } from "next-intl";

import { formatMoney, isCurrency } from "@/domain/money";
import { messagesFor } from "@/i18n/messages";
import type { StoredPayload } from "@/services/notifications/types";

export function renderNotification(payload: StoredPayload, locale: "id" | "en"): { title: string; body: string } {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "notifications" });
  const d = payload.data ?? {};
  const amount =
    d.amount !== undefined && d.currency && isCurrency(d.currency)
      ? formatMoney(d.amount, d.currency, locale === "en" ? "en-US" : "id-ID")
      : "";
  const params = {
    actor: d.actorName ?? "?",
    counterpart: d.counterpartName ?? "",
    group: d.groupName ?? "",
    title: d.title ?? "",
    amount,
    days: d.days ?? 0,
    reason: d.reason && !d.reason.startsWith("system:") ? d.reason : "",
    direction: d.direction ?? "none",
    decision: d.decision ?? "APPROVED",
    mode: d.mode ?? "CONFIRM",
    hasGroup: d.groupName ? "yes" : "no",
    hasCounterpart: d.counterpartName ? "yes" : "no",
    hasReason: d.reason && !d.reason.startsWith("system:") ? "yes" : "no",
    hasTitle: d.title ? "yes" : "no",
    changes: d.changes?.[0] ?? "other",
    seq: d.seq ?? 0,
    seqTotal: d.seqTotal ?? 0,
    hasSeq: d.seq ? "yes" : "no",
  };
  const key = payload.type as keyof ReturnType<typeof messagesFor>["notifications"];
  if (!t.has(`${key}.title` as never)) return { title: "Catetin", body: "" };
  return { title: t(`${key}.title` as never, params as never), body: t(`${key}.body` as never, params as never) };
}
