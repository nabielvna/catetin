"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { offset } from "@/actions/payments";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { MoneyInput } from "@/components/forms/money-input";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import type { LocalDate } from "@/domain/dates";
import { type Currency, fromMajor, toInputString } from "@/domain/money";
import { useRouter } from "@/i18n/navigation";
import { money } from "@/lib/format";
import type { PaymentContext } from "@/services/payments/queries";

export function OffsetForm({ ctx, today, currency }: { ctx: PaymentContext; today: LocalDate; currency: Currency }) {
  const t = useTranslations("offset");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [id] = useState(() => uuidv7());
  const name = ctx.name.split(" ")[0] ?? ctx.name;
  const mine = ctx.obligations
    .filter((o) => o.direction === "I_OWE" && o.currency === currency)
    .reduce((s, o) => s + o.available, 0);
  const theirs = ctx.obligations
    .filter((o) => o.direction === "THEY_OWE" && o.currency === currency)
    .reduce((s, o) => s + o.available, 0);
  const max = Math.min(mine, theirs);
  const [raw, setRaw] = useState(toInputString(max, currency));
  const [amount, setAmount] = useState<number | null>(max);
  const { pending, run } = useAction();

  const review = useReview<{ action: string; partyId?: string; amount?: number }>({
    tools: ["managePayment"],
    match: (i) => i.action === "OFFSET" && i.partyId === ctx.partyId,
    apply: (i) => {
      if (i.amount === undefined) return;
      const minor = fromMajor(i.amount, currency);
      setRaw(toInputString(minor, currency));
      setAmount(minor);
    },
  });

  if (max <= 0) return <p className="px-5 text-sm text-muted-foreground">{te("NOTHING_TO_OFFSET")}</p>;
  const valid = amount !== null && amount > 0 && amount <= max;

  return (
    <form
      className="flex flex-col gap-6 px-5 pt-2 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        run(() => offset({ id, pairId: ctx.pairId, amount: amount!, currency, paidOn: today }), {
          success: t("saved", { name }),
          onSuccess: () => {
            void review.finish();
            router.replace(`/people/${ctx.partyId}`);
          },
        });
      }}
    >
      <ReviewBanner review={review} />
      <h2 className="text-xl font-bold tracking-[-0.02em]">{t("title")}</h2>
      <p className="text-[15px] text-muted-foreground">
        {t("explain", {
          name,
          mine: money(mine, currency, locale),
          theirs: money(theirs, currency, locale),
          amount: money(amount ?? 0, currency, locale),
        })}
      </p>
      <MoneyInput
        label={t("amount")}
        value={raw}
        currency={currency}
        invalidHint={te("INVALID_INPUT")}
        onChange={(r, p) => {
          setRaw(r);
          setAmount(p);
        }}
      />
      {amount !== null && amount > max ? <p className="text-sm text-neg">{te("OVERPAY")}</p> : null}
      <p className="text-[13px] text-muted-foreground">{t("needsApproval", { name })}</p>
      <Button type="submit" size="lg" disabled={!valid || pending} data-tour="offset.submit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
