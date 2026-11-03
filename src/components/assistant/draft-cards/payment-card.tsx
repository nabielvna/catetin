"use client";
import { useLocale, useTranslations } from "next-intl";

import { cancelPayment } from "@/actions/payments";
import type { DraftProps } from "@/components/assistant/draft-cards/parts";
import { useSave } from "@/components/assistant/draft-cards/parts";
import { Shell } from "@/components/assistant/draft-cards/parts";
import { savedMoney } from "@/components/assistant/draft-cards/parts";
import { ResultRow } from "@/components/assistant/draft-cards/parts";
import { ReviewActions } from "@/components/assistant/draft-cards/parts";
import { fromMajor } from "@/domain/money";
import { money } from "@/lib/format";
import type { PaymentInput } from "@/services/assistant/types";

export function PaymentDraftCard({ input, output, dir, photo, live, onCancel, onReview }: DraftProps<PaymentInput>) {
  const t = useTranslations("assistant.draft");
  const tp = useTranslations("payment");
  const locale = useLocale();
  const { run } = useSave();
  const currency = input.currency ?? dir.me.currency;
  const name = dir.people.find((p) => p.id === input.partyId)?.name ?? "?";
  const first = name.split(" ")[0] ?? name;
  const cross = input.debtCurrency && input.debtCurrency !== currency ? input.debtCurrency : null;
  const amount = input.amount ? money(fromMajor(input.amount, currency), currency, locale) : t("payAll");
  const label = input.direction === "IN" ? tp("receiveTitle", { name: first }) : tp("payTitle", { name: first });

  if (output) {
    return (
      <Shell title={t("payment")} done>
        <span className="text-[15px] font-semibold">
          {label} · {savedMoney(output, null, locale) || amount}
        </span>
        <ResultRow
          output={output}
          name={first}
          href={output.id ? `/payments/${output.id}` : undefined}
          onUndo={output.id ? async () => Boolean(await run(() => cancelPayment({ id: output.id! }))) : undefined}
        />
      </Shell>
    );
  }
  return (
    <Shell title={t("payment")} done={!live}>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-extrabold num tracking-[-0.03em]">{amount}</span>
      <span className="text-xs text-muted-foreground">
        {[
          tp(`methods.${input.method ?? "TRANSFER"}`),
          input.paidOn,
          cross ? t("crossCurrency", { from: currency, to: cross }) : null,
          input.groupId ? dir.groups.find((g) => g.id === input.groupId)?.name : null,
          input.allowExcess ? t("excess") : null,
          input.attachPhoto && photo ? t("photo") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <ReviewActions
        live={live}
        onCancel={onCancel}
        onReview={() => onReview(`/payments/new?with=${input.partyId}&dir=${input.direction === "IN" ? "in" : "out"}`)}
      />
    </Shell>
  );
}
