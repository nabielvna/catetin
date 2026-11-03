"use client";

import { ArrowDownWideNarrow, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { DatedRowSkeleton } from "@/components/layout/skeletons";
import { SkeletonText } from "@/components/ui/skeleton";
import { DEFAULT_RECORD_FILTER, type Facet, isDefaultRecordFilter, type RecordFilter } from "@/domain/records";
import { cn } from "@/lib/utils";

export function RecordsSkeleton({ filter = DEFAULT_RECORD_FILTER }: { filter?: RecordFilter }) {
  const t = useTranslations("records");
  const tc = useTranslations("categories");
  const facets: Facet[] = ["status", "dir", "people", "groups", "labels", "categories", "currencies"];
  const shown = facets.filter((f) => f === "status" || f === "dir" || f === "people" || filter[f].length > 0);
  const nameOf = (f: Facet, v: string): React.ReactNode =>
    f === "status"
      ? t(`status.${v as "OPEN"}`)
      : f === "dir"
        ? t(`dir.${v as "I_OWE"}`)
        : f === "labels"
          ? `#${v}`
          : f === "categories"
            ? tc(v as "OTHER")
            : f === "currencies"
              ? v
              : null;
  const chipLabel = (f: Facet): React.ReactNode => {
    const sel = filter[f];
    if (sel.length === 0) return t(`facets.${f}`);
    const first = nameOf(f, sel[0]!);
    if (first === null) return <SkeletonText w="6ch" />;
    return sel.length === 1 ? first : t("andMore", { first: String(first), count: sel.length - 1 });
  };

  return (
    <div className="flex flex-col px-5 pb-10" aria-busy>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pt-1 pb-1" aria-hidden>
        {shown.map((f) => (
          <span
            key={f}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 rounded-full border pr-2.5 pl-3.5 text-[13px] font-semibold",
              filter[f].length > 0 ? "border-foreground bg-foreground text-background" : "border-border",
            )}
          >
            <span className="max-w-40 truncate">{chipLabel(f)}</span>
            <ChevronDown className="size-3.5" strokeWidth={2.2} />
          </span>
        ))}
        {!isDefaultRecordFilter(filter) ? (
          <span className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-muted-foreground">
            <X className="size-3.5" />
            {t("clearAll")}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-[13px] text-muted-foreground">
          <SkeletonText w="24ch" />
        </span>
        <span className="flex h-11 items-center gap-1.5 text-[13px] font-semibold">
          <ArrowDownWideNarrow className="size-4" aria-hidden />
          {t(`sort.${filter.sort}`)}
        </span>
      </div>
      {filter.sort === "largest" ? null : (
        <h2 className="pt-5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          <SkeletonText w="12ch" />
        </h2>
      )}
      <ul>
        <DatedRowSkeleton />
        <DatedRowSkeleton title="8ch" sub="13ch" />
        <DatedRowSkeleton />
        <DatedRowSkeleton title="13ch" sub="12ch" />
        <DatedRowSkeleton title="9ch" />
      </ul>
    </div>
  );
}
