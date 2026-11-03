"use client";

import { Loader2, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { stopRepeat } from "@/actions/debts";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecurringItem } from "@/services/debts/recurring";

export function PersonRecurring({ items, name }: { items: RecurringItem[]; name: string }) {
  const t = useTranslations("recurring");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState<RecurringItem | null>(null);
  const { pending, run } = useAction();
  if (items.length === 0) return null;

  const line = (r: RecurringItem) =>
    `${money(r.amount, r.currency, locale)} ${t(`every.${r.every}`)} · ${
      r.status === "PENDING"
        ? t(r.mine ? "waiting" : "needsYou", { name })
        : t("next", { date: formatDate(r.nextOn, locale, { day: "numeric", month: "short" }) })
    }`;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t("title")}</h2>
      <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg bg-soft">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              data-tour="person.recurring.item"
              onClick={() => setOpen(r)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-foreground/4"
            >
              <Repeat className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold">{r.title}</span>
                <span className="truncate text-[12.5px] text-muted-foreground">{line(r)}</span>
              </span>
              <span className={cn("text-[12.5px] font-semibold", r.direction === "THEY_OWE" ? "text-pos" : "text-neg")}>
                {r.direction === "THEY_OWE" ? t("theyPay", { name }) : t("youPay")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Drawer open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent>
          {open ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{open.title}</DrawerTitle>
                <DrawerDescription>
                  {line(open)}
                  {open.dueAfterDays !== null ? ` · ${t("dueAfter", { days: open.dueAfterDays })}` : ""}
                </DrawerDescription>
              </DrawerHeader>
              <p className="px-5 text-[14px] leading-snug text-muted-foreground">{t("stopHint")}</p>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  disabled={pending}
                  data-tour="person.recurring.stop"
                  onClick={() =>
                    run(() => stopRepeat({ id: open.id }), { success: t("stopped"), onSuccess: () => setOpen(null) })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {open.status === "PENDING" && !open.mine ? tc("reject") : t("stop")}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(null)}>
                  {tc("close")}
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </section>
  );
}
