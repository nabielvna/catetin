"use client";

import { useLocale, useTranslations } from "next-intl";

import { Amount, EmptyState, Initial } from "@/components/records/record-parts";
import type { Currency } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import type { PersonListItem } from "@/services/people/queries";

export function PickPayee({ people }: { people: PersonListItem[] }) {
  const t = useTranslations("payment");
  const th = useTranslations("home");
  const locale = useLocale();
  if (people.length === 0)
    return (
      <div className="px-5">
        <EmptyState body={th("allClear")} />
      </div>
    );
  return (
    <div className="flex flex-col px-5">
      <span className="pb-2 text-[13px] font-medium text-muted-foreground">{t("who")}</span>
      <ul data-tour="payment.pick">
        {people.map((p) => {
          const [c, v] = (Object.entries(p.net) as Array<[Currency, number]>)[0]!;
          return (
            <li key={p.partyId} className="border-b border-line last:border-0">
              <Link
                href={`/payments/new?with=${p.partyId}&dir=${v > 0 ? "in" : "out"}`}
                className="flex items-center gap-3 py-3"
              >
                <Initial name={p.name} />
                <span className="flex-1 truncate text-[15px] font-semibold">{p.name}</span>
                <Amount value={v} currency={c} locale={locale} className="text-[15px]" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
