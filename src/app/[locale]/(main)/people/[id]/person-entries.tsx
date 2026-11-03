"use client";

import { Clock3, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Amount, DateBlock } from "@/components/records/record-parts";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonEntry } from "@/services/people/queries";

type Tab = "active" | "settled" | "history";

export function PersonEntries({ entries, name, labels }: { entries: PersonEntry[]; name: string; labels: string[] }) {
  const t = useTranslations("person");
  const tl = useTranslations("labels");
  const [tab, setTab] = useState<Tab>("active");
  const [label, setLabel] = useState<string | null>(null);
  const shown = label ? entries.filter((e) => e.labels.includes(label)) : entries;
  const obligations = shown.filter((e) => e.kind === "OBLIGATION");
  const active = obligations.filter((e) => (e.status === "ACTIVE" && !e.settled) || e.status === "PENDING");
  const settled = obligations.filter((e) => e.settled);
  const list = tab === "active" ? active : tab === "settled" ? settled : shown;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "active", label: t("tabs.active"), count: active.length },
    { key: "settled", label: t("tabs.settled"), count: settled.length },
    { key: "history", label: t("tabs.history") },
  ];

  return (
    <section className="mt-6">
      <div role="tablist" className="flex gap-5 border-b border-line px-5">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-sm",
              tab === x.key ? "border-foreground font-bold" : "border-transparent font-medium text-muted-foreground",
            )}
          >
            {x.label}
            {x.count !== undefined ? <span className="ml-1 font-medium text-muted-foreground">{x.count}</span> : null}
          </button>
        ))}
      </div>
      {labels.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-1" role="radiogroup" aria-label={tl("filter")}>
          {[null, ...labels].map((l) => (
            <button
              key={l ?? "_all"}
              type="button"
              role="radio"
              aria-checked={label === l}
              onClick={() => setLabel(l)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-[13px] font-semibold",
                label === l ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              {l === null ? tl("all") : `#${l}`}
            </button>
          ))}
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {tab === "history" ? t("emptyHistory") : t("emptyActive", { name })}
        </p>
      ) : (
        <ul className="px-5">
          {list.map((e) => (
            <EntryRow key={`${e.kind}:${e.id}`} e={e} name={name} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ e, name }: { e: PersonEntry; name: string }) {
  const locale = useLocale();
  const td = useTranslations("debt");
  const tp = useTranslations("payment");
  const tc = useTranslations("categories");
  const tm = useTranslations("money");
  const tcm = useTranslations("common");

  if (e.kind === "SETTLEMENT") {
    const label =
      e.settlementKind === "PAYMENT"
        ? `${tp("kind.PAYMENT")}${e.method ? ` · ${tp(`methods.${e.method as "CASH"}`)}` : ""}`
        : tp(`kind.${e.settlementKind ?? "PAYMENT"}`);
    const dim = e.status !== "ACTIVE";
    return (
      <li className="border-b border-line last:border-0">
        <Link href={`/payments/${e.id}`} className="flex items-center gap-3.5 py-3">
          <DateBlock date={e.date} locale={locale} />
          <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", dim && "opacity-60")}>
            <span className="truncate text-[15px] font-semibold">{label}</span>
            <span className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
              {e.pendingWith ? <Clock3 className="size-3.5" /> : null}
              {e.pendingWith === "THEM"
                ? td("waitingFor", { name })
                : e.pendingWith === "ME"
                  ? td("status.PENDING")
                  : e.status !== "ACTIVE"
                    ? td(`status.${e.status === "CANCELLED" ? "VOID" : (e.status as "VOID")}`)
                    : e.title || (e.direction === "IN" ? `${name} → ${tcm("you")}` : `${tcm("you")} → ${name}`)}
            </span>
          </div>
          <span className={cn("text-[15px] font-bold num text-muted-foreground", dim && "line-through")}>
            {money(e.amount, e.currency, locale)}
          </span>
        </Link>
      </li>
    );
  }

  const muted = e.status === "PENDING" || e.status === "REJECTED" || e.status === "VOID" || e.settled;
  const sub = (() => {
    if (e.pendingWith === "THEM") return td("waitingFor", { name });
    if (e.pendingWith === "ME") return td("status.PENDING");
    if (e.status === "REJECTED" || e.status === "VOID") return td(`status.${e.status}`);
    if (e.settled) return tm("settled");
    const parts: string[] = [];
    if (e.installment) parts.push(td("installmentOf", { seq: e.installment.seq, count: e.installment.count }));
    if (e.remaining !== e.amount) parts.push(tm("remaining", { amount: money(e.remaining, e.currency, locale) }));
    else if (e.category) parts.push(tc(e.category as "FOOD"));
    else parts.push(e.direction === "THEY_OWE" ? tm("theyOweYou", { name }) : tm("youOweThem", { name }));
    return parts.join(" · ");
  })();
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/debts/${e.id}`} className="flex items-center gap-3.5 py-3">
        <DateBlock date={e.date} locale={locale} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-[15px] font-semibold",
              (e.status === "VOID" || e.status === "REJECTED") && "line-through opacity-60",
            )}
          >
            {e.title}
          </span>
          <span className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
            {e.pendingWith ? <Clock3 className="size-3.5 shrink-0" /> : null}
            {e.recurring ? <Repeat className="size-3.5 shrink-0" aria-label={td("recurringBadge")} /> : null}
            <span className="truncate">
              {sub}
              {e.groupName ? ` · ${e.groupName}` : ""}
              {e.labels.length ? ` · ${e.labels.map((l) => `#${l}`).join(" ")}` : ""}
            </span>
          </span>
        </div>
        <Amount
          value={e.direction === "THEY_OWE" ? e.amount : -e.amount}
          currency={e.currency}
          locale={locale}
          tone={muted ? "muted" : undefined}
          className="text-[15px]"
        />
      </Link>
    </li>
  );
}
