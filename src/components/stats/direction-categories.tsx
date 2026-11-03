"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Segmented } from "@/components/forms/chips";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";

export type CategoryBar = { key: string; label: string; amount: number; count: number; href: string };

export function DirectionCategories({
  theirs,
  mine,
  labels,
  currency,
}: {
  theirs: CategoryBar[];
  mine: CategoryBar[];
  labels: { theirs: string; mine: string; aria: string };
  currency: string;
}) {
  const locale = useLocale();
  const [dir, setDir] = useState<"theirs" | "mine">(theirs.length ? "theirs" : "mine");
  const list = dir === "theirs" ? theirs : mine;
  const max = list[0]?.amount || 1;
  return (
    <div className="flex flex-col">
      {theirs.length && mine.length ? (
        <div className="pt-2 pb-1">
          <Segmented
            ariaLabel={labels.aria}
            value={dir}
            onChange={setDir}
            options={[
              { value: "theirs", label: labels.theirs },
              { value: "mine", label: labels.mine },
            ]}
          />
        </div>
      ) : (
        <span className="pt-1 text-[13px] text-muted-foreground">{theirs.length ? labels.theirs : labels.mine}</span>
      )}
      <ul>
        {list.map((c) => (
          <li key={c.key}>
            <Link href={c.href} className="flex flex-col gap-1.5 py-2.5">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-semibold">{c.label}</span>
                <span className="shrink-0 num">
                  <b className="font-bold">{money(c.amount, currency, locale)}</b>
                  <span className="text-muted-foreground"> · {c.count}×</span>
                </span>
              </span>
              <span className="h-2 w-full rounded-full bg-soft">
                <span
                  className="block h-2 rounded-full bg-foreground"
                  style={{ width: `${Math.max(2, Math.round((c.amount / max) * 100))}%` }}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
