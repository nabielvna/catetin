"use client";

import { ArrowLeftRight, Banknote, FileText, HandHeart, Receipt, Shuffle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Amount, Initial } from "@/components/records/record-parts";
import type { RecordRow } from "@/domain/records";
import { Link } from "@/i18n/navigation";
import { formatDate, money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecentEntry } from "@/services/records";

export function OpenRow({ r }: { r: RecordRow }) {
  const t = useTranslations("home");
  const locale = useLocale();
  const name = r.groupName ?? r.counterpartName;
  const sub = [
    r.title,
    r.groupName ? (r.direction === "I_OWE" ? t("toPerson", { name: r.counterpartName }) : r.counterpartName) : null,
    t("since", {
      date: formatDate(r.occurredOn, locale, {
        day: "numeric",
        month: "short",

        year: r.occurredOn.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric",
      }),
    }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/debts/${r.id}`} className="flex items-center gap-3.5 py-3">
        <Initial name={name} className="size-9 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Amount
            value={r.direction === "THEY_OWE" ? r.remaining : -r.remaining}
            currency={r.currency}
            locale={locale}
            className="text-[15px]"
          />
          {r.remaining !== r.amount ? (
            <span className="text-xs num text-muted-foreground">
              {t("ofAmount", { amount: money(r.amount, r.currency, locale) })}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

const KIND_ICON = {
  OBLIGATION: FileText,
  PAYMENT: Banknote,
  OFFSET: ArrowLeftRight,
  FORGIVE: HandHeart,
  NETTING: Shuffle,
} as const;

export function RecentRow({ e }: { e: RecentEntry }) {
  const t = useTranslations("home");
  const td = useTranslations("debt");
  const tm = useTranslations("money");
  const locale = useLocale();
  const name = e.counterpartName;
  const Icon = e.fromBill ? Receipt : KIND_ICON[e.kind];
  const isDebt = e.kind === "OBLIGATION";

  const title = isDebt
    ? e.title
    : e.kind === "PAYMENT"
      ? e.direction === "OUT"
        ? t("entry.youPaid", { name })
        : t("entry.paid", { name })
      : e.kind === "OFFSET"
        ? t("entry.offset", { name })
        : e.kind === "NETTING"
          ? t("entry.netting", { name })
          : e.direction === "OUT"
            ? t("entry.youForgave", { name })
            : t("entry.forgaveYou", { name });
  const status =
    e.pendingWith === "THEM"
      ? td("waitingFor", { name })
      : e.pendingWith === "ME"
        ? td("status.PENDING")
        : e.status === "REJECTED" || e.status === "VOID" || e.status === "CANCELLED"
          ? td(`status.${e.status === "CANCELLED" ? "VOID" : e.status}`)
          : null;
  const context = isDebt
    ? [
        e.fromBill ? t("fromBill") : null,
        e.groupName ?? (e.direction === "THEY_OWE" ? tm("theyOweYou", { name }) : tm("youOweThem", { name })),
      ]
    : [e.groupName, e.title || null];
  const sub = [...context, status, relativeTime(e.createdAt, locale)].filter(Boolean).join(" · ");
  const inactive = e.status !== "ACTIVE";

  return (
    <li className="border-b border-line last:border-0">
      <Link href={isDebt ? `/debts/${e.id}` : `/payments/${e.id}`} className="flex items-center gap-3.5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft" aria-hidden>
          <Icon className="size-4.5" strokeWidth={1.8} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-[15px] font-semibold",
              (e.status === "REJECTED" || e.status === "VOID" || e.status === "CANCELLED") && "line-through opacity-60",
            )}
          >
            {title}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
        </div>
        {isDebt ? (
          <Amount
            value={e.direction === "THEY_OWE" ? e.amount : -e.amount}
            currency={e.currency}
            locale={locale}
            tone={inactive ? "muted" : undefined}
            className="shrink-0 text-[15px]"
          />
        ) : (
          <span className="shrink-0 text-[15px] font-bold num whitespace-nowrap text-muted-foreground">
            {money(e.amount, e.currency, locale)}
          </span>
        )}
      </Link>
    </li>
  );
}
