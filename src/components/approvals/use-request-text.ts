"use client";

import { useLocale, useTranslations } from "next-intl";

import { money } from "@/lib/format";
import type { RequestItem } from "@/services/approvals/queries";

export function useRequestText() {
  const t = useTranslations("inbox");
  const tg = useTranslations("groups");
  const tr = useTranslations("recurring");
  const locale = useLocale();
  return (item: RequestItem, perspective: "awaiting" | "waiting") => {
    const amount = item.amount !== null && item.currency ? money(item.amount, item.currency, locale) : "";
    const params = {
      actor: item.requesterName,
      name: item.approverName ?? "",
      amount,
      title: item.title ?? "",
      group: item.groupName ?? "",
      mode: !item.mode
        ? ""
        : item.kind === "RECURRING_CREATE"
          ? tr(`every.${item.mode as "WEEK" | "MONTH" | "YEAR"}`)
          : tg(`modes.${item.mode as "CONFIRM" | "TRUST"}`),
    };
    const key = item.displayKind as keyof IntlMessages["inbox"]["kinds"];
    return perspective === "awaiting" ? t(`kinds.${key}`, params) : t(`waitingKinds.${key}`, params);
  };
}

type IntlMessages = typeof import("@/i18n/messages/id.json");
