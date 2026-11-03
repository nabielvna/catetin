"use client";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { DraftProps } from "@/components/assistant/draft-cards/parts";
import { Shell } from "@/components/assistant/draft-cards/parts";
import { savedMoney } from "@/components/assistant/draft-cards/parts";
import { ResultRow } from "@/components/assistant/draft-cards/parts";
import { ReviewActions } from "@/components/assistant/draft-cards/parts";
import { resolveBill } from "@/domain/assistant-drafts";
import { fromMajor } from "@/domain/money";
import { computeSplit } from "@/domain/split";
import { money } from "@/lib/format";
import type { BillInput } from "@/services/assistant/types";

export function BillDraftCard({ input, output, dir, live, onCancel, onReview }: DraftProps<BillInput>) {
  const t = useTranslations("assistant.draft");
  const locale = useLocale();
  const [newIds] = useState(() => new Map<string, string>());
  const resolved = useMemo(
    () =>
      resolveBill(input, dir, (key) => {
        if (!newIds.has(key)) newIds.set(key, `new-${newIds.size}`);
        return newIds.get(key)!;
      }),
    [input, dir, newIds],
  );
  const currency = resolved.currency;

  const nameOf = (pid: string) =>
    pid === dir.me.partyId
      ? dir.me.name
      : (dir.people.find((p) => p.id === pid)?.name ?? resolved.newPeople.find((p) => p.id === pid)?.name ?? "?");

  const split = useMemo(() => {
    try {
      return computeSplit({
        participants: resolved.participants,
        mode: resolved.mode,
        items: resolved.items.length ? resolved.items : undefined,
        subtotal: resolved.items.length
          ? undefined
          : resolved.mode === "EXACT" && resolved.exact
            ? Object.values(resolved.exact).reduce((a, b) => a + b, 0)
            : input.subtotal
              ? fromMajor(input.subtotal, currency)
              : undefined,
        exact: resolved.mode === "EXACT" ? resolved.exact : undefined,
        shares: resolved.mode === "SHARES" ? resolved.shares : undefined,
        serviceBps: input.serviceBps,
        taxBps: input.taxBps,
        serviceAmount: input.serviceAmount !== undefined ? fromMajor(input.serviceAmount, currency) : undefined,
        taxAmount: input.taxAmount !== undefined ? fromMajor(input.taxAmount, currency) : undefined,
        discount: input.discount ? { type: "AMOUNT", value: fromMajor(input.discount, currency) } : null,
      });
    } catch {
      return null;
    }
  }, [resolved, input, currency]);

  if (output) {
    return (
      <Shell title={t("bill")} done>
        <span className="text-[15px] font-semibold">
          {output.title ?? input.title} ·{" "}
          {savedMoney(output, null, locale) || (split ? money(split.total, currency, locale) : "")}
        </span>
        <ResultRow output={output} href={output.id ? `/bills/${output.id}` : undefined} />
      </Shell>
    );
  }
  return (
    <Shell title={t("bill")} done={!live}>
      <span className="text-[15px] font-bold">{input.title}</span>
      <span className="text-xs text-muted-foreground">
        {t("payer")}: {resolved.payerId ? nameOf(resolved.payerId) : "?"}
      </span>
      {split ? (
        <ul className="flex flex-col gap-1 text-sm">
          {split.shares.map((s) => (
            <li key={s.partyId} className="flex justify-between gap-3">
              <span className="truncate">{nameOf(s.partyId)}</span>
              <span className="font-semibold num">{money(s.total, currency, locale)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-line pt-1 font-bold">
            <span>Total</span>
            <span className="num">{money(split.total, currency, locale)}</span>
          </li>
        </ul>
      ) : (
        <span className="text-sm text-neg">?</span>
      )}
      <ReviewActions
        live={live}
        onCancel={onCancel}
        onReview={() => onReview(`/bills/new${input.groupId ? `?group=${input.groupId}` : ""}`)}
      />
    </Shell>
  );
}
