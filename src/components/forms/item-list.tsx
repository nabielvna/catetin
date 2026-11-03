"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Currency, type Minor, parseAmount } from "@/domain/money";

export type ItemRow = { id: string; name: string; raw: string; suspect?: boolean };

export function parseItems<T extends ItemRow>(items: T[], currency: Currency): Array<T & { amount: Minor | null }> {
  return items.map((it) => ({ ...it, amount: it.raw.trim() ? parseAmount(it.raw, currency) : null }));
}

export function itemsValid(items: ItemRow[], currency: Currency): boolean {
  const parsed = parseItems(items, currency);
  return (
    parsed.every((it) => !it.raw.trim() || it.amount !== null) &&
    parsed.some((it) => it.name.trim() && (it.amount ?? 0) > 0)
  );
}

export function ItemList<T extends ItemRow>({
  items,
  onChange,
  newItem,
  label,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  label: ReactNode;
}) {
  const t = useTranslations("items");
  const tc = useTranslations("common");

  const set = (id: string, patch: Partial<ItemRow>) =>
    onChange(items.map((x) => (x.id === id ? { ...x, suspect: false, ...patch } : x)));
  const remove = (id: string) => onChange(items.length > 1 ? items.filter((x) => x.id !== id) : [newItem()]);
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">{label}</span>
      {items.map((it, i) => (
        <div key={it.id} className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1fr_120px_40px] gap-2">
            <Input
              value={it.name}
              placeholder={t("name", { n: i + 1 })}
              aria-label={t("name", { n: i + 1 })}
              aria-invalid={it.suspect || undefined}
              maxLength={100}
              onChange={(e) => set(it.id, { name: e.target.value })}
            />
            <Input
              value={it.raw}
              inputMode="decimal"
              placeholder="0"
              aria-label={t("price", { n: i + 1 })}
              aria-invalid={it.suspect || undefined}
              className="text-right"
              onChange={(e) => set(it.id, { raw: e.target.value })}
            />
            <button
              type="button"
              aria-label={tc("delete")}
              className="flex items-center justify-center text-muted-foreground"
              onClick={() => remove(it.id)}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {it.suspect ? (
            <div className="flex items-center gap-2 text-[13px] text-neg" role="alert">
              <TriangleAlert className="size-4 shrink-0" />
              <span className="flex-1 leading-snug">{t("suspect")}</span>
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="rounded-md bg-neg px-2.5 py-1 text-xs font-semibold text-white"
              >
                {t("remove")}
              </button>
              <button
                type="button"
                onClick={() => set(it.id, {})}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground"
              >
                {t("keep")}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...items, newItem()])}
      >
        <Plus /> {t("add")}
      </Button>
    </div>
  );
}
