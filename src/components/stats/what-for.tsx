"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Segmented } from "@/components/forms/chips";
import { Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { PersonShare } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WhatForBucket = {
  key: string;
  label: string;
  amount: number;
  count: number;

  top: string | null;
  in: PersonShare[];
  out: PersonShare[];

  href: string;
};

export function WhatFor({
  categories,
  labels,
  currency,
  hint,
}: {
  categories: WhatForBucket[];
  labels: WhatForBucket[];
  currency: string;
  hint?: boolean;
}) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const [by, setBy] = useState<"category" | "label">("category");
  const [open, setOpen] = useState<WhatForBucket | null>(null);
  const [dir, setDir] = useState<"in" | "out">("in");
  const list = by === "label" && labels.length ? labels : categories;
  const total = list.reduce((s, b) => s + b.amount, 0);
  const max = list[0]?.amount ?? 1;

  return (
    <>
      {labels.length > 0 ? (
        <div className="flex gap-1.5 pt-1" role="radiogroup" aria-label={t("forWhat")}>
          {(["category", "label"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={by === k}
              onClick={() => setBy(k)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-semibold",
                by === k ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              {k === "category" ? t("byCategory") : t("byLabel")}
            </button>
          ))}
        </div>
      ) : null}
      {hint !== false ? <span className="pt-2 text-[13px] text-muted-foreground">{t("tapForWho")}</span> : null}
      <ul>
        {list.map((b) => (
          <li key={b.key}>
            <button
              type="button"
              onClick={() => {
                setOpen(b);
                setDir(b.in.length ? "in" : "out");
              }}
              className="flex w-full flex-col gap-1.5 py-2.5 text-left"
            >
              <span className="flex w-full items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold">
                  {b.label}
                  {b.top ? <span className="font-normal text-muted-foreground"> · {b.top}</span> : null}
                </span>
                <span className="shrink-0 num">
                  <b className="font-bold">{money(b.amount, currency, locale)}</b>
                  <span className="text-muted-foreground"> · {Math.round((b.amount / (total || 1)) * 100)}%</span>
                </span>
              </span>
              <span className="h-2 w-full rounded-full bg-soft">
                <span
                  className="block h-2 rounded-full bg-foreground"
                  style={{ width: `${Math.max(2, Math.round((b.amount / max) * 100))}%` }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Drawer open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent className="max-h-[85dvh]">
          {open ? (
            <>
              <DrawerHeader className="pb-3">
                <DrawerTitle className="text-xl font-extrabold">{open.label}</DrawerTitle>
                <DrawerDescription className="num">
                  {t("sheetSub", {
                    amount: money(open.amount, currency, locale),
                    share: Math.round((open.amount / (total || 1)) * 100),
                    count: open.count,
                  })}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
                {open.in.length && open.out.length ? (
                  <Segmented
                    ariaLabel={t("forWhat")}
                    value={dir}
                    onChange={setDir}
                    options={[
                      { value: "in", label: t("theyBorrowed", { count: open.in.reduce((s, p) => s + p.count, 0) }) },
                      { value: "out", label: t("youBorrowed", { count: open.out.reduce((s, p) => s + p.count, 0) }) },
                    ]}
                  />
                ) : null}
                <ul className="pt-1">
                  {(dir === "in" ? open.in : open.out).map((p, _, arr) => (
                    <li key={p.id} className="border-b border-line last:border-0">
                      <Link href={`/people/${p.id}/stats`} className="flex items-center gap-3 py-2.5">
                        <Initial name={p.name} className="size-8 text-[13px]" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="flex justify-between gap-3 text-sm">
                            <span className="truncate font-semibold">
                              {p.name}{" "}
                              <span className="font-normal text-muted-foreground">
                                · {t("times", { count: p.count })}
                              </span>
                            </span>
                            <b className="shrink-0 font-bold num">{money(p.amount, currency, locale)}</b>
                          </span>
                          <span className="h-1.5 w-full rounded-full bg-soft">
                            <span
                              className="block h-1.5 rounded-full bg-foreground"
                              style={{ width: `${Math.max(2, Math.round((p.amount / (arr[0]?.amount || 1)) * 100))}%` }}
                            />
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-5 pt-3 pb-5">
                <Button asChild className="w-full">
                  <Link href={open.href}>{t("seeRecords", { count: open.count })}</Link>
                </Button>
              </div>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
