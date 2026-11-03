import { useLocale, useTranslations } from "next-intl";

import { money, relativeTime } from "@/lib/format";
import type { ActivityItem } from "@/services/debts/queries";

export function ActivityList({ items, currency }: { items: ActivityItem[]; currency?: string }) {
  const t = useTranslations("activity");
  const tc = useTranslations("common");
  const td = useTranslations("debt");
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <ol className="flex flex-col">
      {items.map((a) => {
        const actor = a.isMe ? tc("you_cap") : (a.actorName ?? "?");
        const cur = (a.data.currency as string | undefined) ?? currency;
        const amount = typeof a.data.amount === "number" && cur ? money(a.data.amount, cur, locale) : "";
        const params = { actor, amount, title: (a.data.title as string | undefined) ?? "" };
        const key = t.has(a.type as never) ? a.type : "fallback";
        const reason = typeof a.data.reason === "string" && a.data.reason ? a.data.reason : null;
        return (
          <li key={a.id} className="flex gap-3 border-b border-line py-2.5 last:border-0">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">
                {t(key as never, params as never)}
                {reason ? <span className="text-muted-foreground"> — “{reason}”</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativeTime(a.createdAt, locale)}
                {a.via === "ASSISTANT" ? ` · ${td("via.ASSISTANT")}` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
