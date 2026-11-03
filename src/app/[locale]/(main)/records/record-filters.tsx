"use client";
import { ArrowDownWideNarrow, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { type MultiOption, MultiSelectSheet } from "@/components/forms/multi-select-sheet";
import { OptionSheet } from "@/components/forms/option-sheet";
import type { Currency } from "@/domain/money";
import {
  DEFAULT_RECORD_FILTER,
  type Facet,
  RECORD_SORTS,
  type RecordFilter,
  recordFilterQuery,
  type RecordSort,
} from "@/domain/records";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type FacetView = {
  key: Facet;
  title: string;
  options: MultiOption[];

  disjoint: boolean;
};

export function RecordsView({
  filter,
  facets,
  summary,
  isDefault,
  children,
}: {
  filter: RecordFilter;
  facets: FacetView[];
  summary: string;
  isDefault: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("records");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openFacet, setOpenFacet] = useState<Facet | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const go = (next: RecordFilter) =>
    startTransition(() => router.replace(`/debts${recordFilterQuery(next)}`, { scroll: false }));

  const chipLabel = (f: FacetView) => {
    const sel = filter[f.key];
    if (sel.length === 0) return f.title;
    const first = f.options.find((o) => o.value === sel[0])?.label ?? sel[0]!;
    return sel.length === 1 ? first : t("andMore", { first, count: sel.length - 1 });
  };

  return (
    <>
      <div
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pt-1 pb-1"
        aria-label={t("title")}
        data-tour="records.filters"
      >
        {facets.map((f) => {
          const on = filter[f.key].length > 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setOpenFacet(f.key)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-9 shrink-0 items-center gap-1 rounded-full border pr-2.5 pl-3.5 text-[13px] font-semibold",
                on ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              <span className="max-w-40 truncate">{chipLabel(f)}</span>
              <ChevronDown className="size-3.5" strokeWidth={2.2} aria-hidden />
            </button>
          );
        })}
        {!isDefault ? (
          <button
            type="button"
            onClick={() => go({ ...DEFAULT_RECORD_FILTER, sort: filter.sort })}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-muted-foreground"
          >
            <X className="size-3.5" aria-hidden />
            {t("clearAll")}
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-[13px] text-muted-foreground">{summary}</span>
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          aria-haspopup="dialog"
          className="flex h-11 items-center gap-1.5 text-[13px] font-semibold"
        >
          <ArrowDownWideNarrow className="size-4" aria-hidden />
          {t(`sort.${filter.sort}`)}
        </button>
      </div>

      <div className={cn("transition-opacity", pending && "opacity-50")} aria-busy={pending}>
        {children}
      </div>

      {facets.map((f) => (
        <MultiSelectSheet
          key={f.key}
          open={openFacet === f.key}
          onOpenChange={(o) => setOpenFacet(o ? f.key : null)}
          title={f.title}
          options={f.options}
          value={filter[f.key]}
          onApply={(v) => go({ ...filter, [f.key]: f.key === "currencies" ? (v as Currency[]) : v })}
          applyLabel={(draft) => {
            if (!f.disjoint) return t("apply");
            const picked = draft.length ? f.options.filter((o) => draft.includes(o.value)) : f.options;
            return t("show", { count: picked.reduce((s, o) => s + (o.count ?? 0), 0) });
          }}
        />
      ))}
      <OptionSheet<RecordSort>
        open={sortOpen}
        onOpenChange={setSortOpen}
        title={t("sortTitle")}
        options={RECORD_SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
        value={filter.sort}
        onSelect={(sort) => go({ ...filter, sort })}
      />
    </>
  );
}
