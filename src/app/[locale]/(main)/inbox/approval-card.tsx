"use client";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { decide } from "@/actions/approvals";
import { useRequestText } from "@/components/approvals/use-request-text";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { formatDate, money, relativeTime } from "@/lib/format";
import type { RequestItem } from "@/services/approvals/queries";

export function RequestCard({ item }: { item: RequestItem }) {
  const t = useTranslations("inbox");
  const tc = useTranslations("common");
  const tch = useTranslations("change");
  const tp = useTranslations("payment");
  const locale = useLocale();
  const text = useRequestText();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  const fmt = (f: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (f === "amount" && item.currency) return money(Number(v), item.currency, locale);
    if (f === "dueOn" || f === "occurredOn") return formatDate(String(v), locale);
    if (f === "installments" && typeof v === "object") {
      const pl = v as { count: number; every: string; firstDue: string };
      return `${pl.count}× · ${formatDate(pl.firstDue, locale)}`;
    }
    return String(v);
  };
  return (
    <article
      data-tour="inbox.request"
      className="flex flex-col gap-3 rounded-lg bg-inverse p-4 text-inverse-foreground"
    >
      <Link href={item.url} className="flex flex-col gap-1">
        <span className="text-[17px] leading-snug font-bold tracking-[-0.01em]">{text(item, "awaiting")}</span>
        <span className="text-[13px] text-inverse-muted">
          {[
            item.method ? tp(`methods.${item.method as "CASH"}`) : null,
            item.title,
            item.groupName,
            relativeTime(item.createdAt, locale),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </Link>
      {item.fields.length > 0 && item.before && item.after ? (
        <ul className="flex flex-col gap-0.5 text-sm">
          {item.fields.map((f) => (
            <li key={f}>
              <span className="text-inverse-muted">{tch(f as "amount")}: </span>
              <span className="line-through opacity-70">{fmt(f, item.before?.[f])}</span> →{" "}
              <b>{fmt(f, item.after?.[f])}</b>
            </li>
          ))}
        </ul>
      ) : null}
      {item.reason ? <p className="text-sm text-inverse-muted">“{item.reason}”</p> : null}
      {rejecting ? (
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={t("reasonPlaceholder")}
          className="border-inverse-line bg-transparent text-inverse-foreground placeholder:text-inverse-muted"
        />
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="inverse-outline"
          className="h-11 flex-1"
          disabled={pending}
          onClick={() =>
            rejecting
              ? run(() => decide({ requestId: item.requestId, decision: "REJECT", reason: reason.trim() || null }))
              : setRejecting(true)
          }
        >
          {tc("reject")}
        </Button>
        {rejecting ? (
          <Button variant="inverse-outline" className="h-11 flex-1" onClick={() => setRejecting(false)}>
            {tc("cancel")}
          </Button>
        ) : (
          <Button
            variant="inverse"
            className="h-11 flex-2"
            disabled={pending}
            onClick={() => run(() => decide({ requestId: item.requestId, decision: "APPROVE" }))}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {item.kind === "OBLIGATION_CREATE" || item.kind === "SETTLEMENT_CREATE" ? tc("confirm") : tc("approve")}
          </Button>
        )}
      </div>
    </article>
  );
}
