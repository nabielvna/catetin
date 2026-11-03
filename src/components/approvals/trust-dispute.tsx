"use client";

import { Handshake, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { dispute } from "@/actions/approvals";
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
import { Input } from "@/components/ui/input";
import { money, relativeTime } from "@/lib/format";
import type { DisputableItem } from "@/services/approvals/disputes";

export function TrustDispute({ items, compact = false }: { items: DisputableItem[]; compact?: boolean }) {
  const t = useTranslations("trust");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState<DisputableItem | null>(null);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  if (items.length === 0) return null;
  const until = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short" }).format(
      new Date(iso),
    );

  return (
    <>
      <ul className={compact ? "flex flex-col" : "mx-5 mt-5 flex flex-col gap-2"}>
        {items.map((a) => (
          <li
            key={a.id}
            className={
              compact
                ? "flex items-center gap-3 border-b border-line py-3 last:border-0"
                : "flex items-center gap-3 rounded-md bg-soft px-3.5 py-3"
            }
          >
            <Handshake className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] leading-snug">
                <b className="font-semibold">{a.actorName}</b> {t(`kinds.${a.kind}`)}
                {a.title ? ` “${a.title}”` : ""}
                {a.amount !== null && a.currency ? ` ${money(a.amount, a.currency, locale)}` : ""}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {compact ? `${relativeTime(a.createdAt, locale)} · ` : ""}
                {t("autoApplied", { date: until(a.disputeUntil) })}
              </span>
            </span>
            <Button size="xs" variant="outline" data-tour="dispute.open" onClick={() => setOpen(a)}>
              {t("dispute")}
            </Button>
          </li>
        ))}
      </ul>
      <Drawer open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent data-tour="dispute.sheet">
          {open ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("disputeTitle")}</DrawerTitle>
                <DrawerDescription>{t("disputeBody", { name: open.actorName })}</DrawerDescription>
              </DrawerHeader>
              <div className="px-5">
                <Input
                  value={reason}
                  maxLength={500}
                  placeholder={t("disputeReason")}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(() => dispute({ id: open.id, reason: reason.trim() || null }), {
                      success: t("disputed"),
                      onSuccess: () => {
                        setOpen(null);
                        setReason("");
                      },
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {t("dispute")}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(null)}>
                  {tc("cancel")}
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
