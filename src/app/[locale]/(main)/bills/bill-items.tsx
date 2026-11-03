"use client";

import { useLocale, useTranslations } from "next-intl";
import { v7 as uuidv7 } from "uuid";

import { ItemList } from "@/components/forms/item-list";
import { ScanMark } from "@/components/scan/scan-section";
import { type Currency } from "@/domain/money";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Item = { id: string; name: string; raw: string; assignees: string[]; suspect?: boolean };
export function BillItems({
  items,
  marked,
  onChange,
}: {
  items: Item[];
  marked: boolean;
  onChange: (items: Item[]) => void;
}) {
  const t = useTranslations("bill");
  return (
    <ItemList
      items={items}
      onChange={onChange}
      newItem={() => ({ id: uuidv7(), name: "", raw: "", assignees: [] })}
      label={
        <>
          {t("items")} <ScanMark show={marked} />
        </>
      }
    />
  );
}
export function BillItemAssignments({
  items,
  parsedItems,
  participants,
  names,
  currency,
  setItems,
  unassigned,
}: {
  items: Item[];
  parsedItems: (Item & { amount: number | null })[];
  participants: string[];
  names: Map<string, string>;
  currency: Currency;
  setItems: (items: Item[]) => void;
  unassigned: number;
}) {
  const t = useTranslations("bill");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-4">
      {parsedItems
        .filter((it) => it.name.trim() && it.amount)
        .map((it) => (
          <div key={it.id} className="flex flex-col gap-2">
            <div className="flex justify-between text-[15px] font-semibold">
              <span>{it.name}</span>
              <span className="num">{money(it.amount!, currency, locale)}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("assign")}>
              {participants.map((p) => {
                const on = it.assignees.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setItems(
                        items.map((x) =>
                          x.id === it.id
                            ? { ...x, assignees: on ? x.assignees.filter((a) => a !== p) : [...x.assignees, p] }
                            : x,
                        ),
                      )
                    }
                    className={cn(
                      "h-9 rounded-md border px-3 text-[13px] font-semibold",
                      on ? "border-foreground bg-foreground text-background" : "border-border",
                    )}
                  >
                    {names.get(p)?.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      {unassigned > 0 ? <p className="text-sm text-neg">{t("unassigned", { count: unassigned })}</p> : null}
    </div>
  );
}
