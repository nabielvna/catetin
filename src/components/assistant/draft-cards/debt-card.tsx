"use client";
import { useLocale, useTranslations } from "next-intl";

import { deleteDebt, stopRepeat } from "@/actions/debts";
import type { DraftProps } from "@/components/assistant/draft-cards/parts";
import { useSave } from "@/components/assistant/draft-cards/parts";
import { Shell } from "@/components/assistant/draft-cards/parts";
import { savedMoney } from "@/components/assistant/draft-cards/parts";
import { ResultRow } from "@/components/assistant/draft-cards/parts";
import { ReviewActions } from "@/components/assistant/draft-cards/parts";
import { fromMajor } from "@/domain/money";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DebtInput } from "@/services/assistant/types";

export function DebtDraftCard({ input, output, dir, photo, live, onCancel, onReview }: DraftProps<DebtInput>) {
  const to = useTranslations("assistant.ops");
  const t = useTranslations("assistant.draft");
  const td = useTranslations("debt");
  const tm = useTranslations("money");
  const tc = useTranslations("categories");
  const locale = useLocale();
  const { run } = useSave();
  const currency = input.currency ?? dir.me.currency;
  const personName = input.person.partyId
    ? (dir.people.find((p) => p.id === input.person.partyId)?.name ?? "?")
    : (input.person.newPersonName ?? "?");
  const first = personName.split(" ")[0] ?? personName;
  const amount = fromMajor(input.amount, currency);
  const group = input.groupId ? dir.groups.find((g) => g.id === input.groupId) : null;

  if (output) {
    return (
      <Shell title={t("debt")} done>
        <span className="text-[15px] font-semibold">
          {output.title ?? input.title} · {savedMoney(output, { amount: input.amount, currency }, locale)}
        </span>
        <ResultRow
          output={output}
          name={first}
          href={
            output.recurring && output.partyId
              ? `/people/${output.partyId}`
              : output.id
                ? `/debts/${output.id}`
                : undefined
          }
          onUndo={
            output.id
              ? async () =>
                  (output.recurring
                    ? await run(() => stopRepeat({ id: output.id! }))
                    : await run(() => deleteDebt({ id: output.id! }))) !== null
              : undefined
          }
        />
      </Shell>
    );
  }

  return (
    <Shell title={t("debt")} done={!live}>
      <div className="flex flex-col gap-1">
        <span className={cn("text-[13px] font-medium", input.direction === "THEY_OWE" ? "text-pos" : "text-neg")}>
          {input.direction === "THEY_OWE" ? tm("theyOweYou", { name: first }) : tm("youOweThem", { name: first })}
          {!input.person.partyId ? ` · ${t("newPerson")}` : ""}
        </span>
        <span className="text-2xl font-extrabold num tracking-[-0.03em]">{money(amount, currency, locale)}</span>
        <span className="text-sm">
          {input.title}
          {input.category ? <span className="text-muted-foreground"> · {tc(input.category as "FOOD")}</span> : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {[
            input.occurredOn,
            input.dueOn && !input.repeat && !input.installments ? `${td("due")} ${input.dueOn}` : null,
            input.installments
              ? t("installments", { count: input.installments.count, every: to(`every.${input.installments.every}`) })
              : null,
            input.repeat ? t("repeat", { every: to(`every.${input.repeat.every}`) }) : null,
            group?.name,
            input.labels?.length ? input.labels.map((l) => `#${l}`).join(" ") : null,
            input.attachPhoto && photo && !input.repeat ? t("photo") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <ReviewActions live={live} onCancel={onCancel} onReview={() => onReview("/debts/new")} />
    </Shell>
  );
}
