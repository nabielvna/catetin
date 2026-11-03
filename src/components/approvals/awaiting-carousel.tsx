"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { decide } from "@/actions/approvals";
import { useRequestText } from "@/components/approvals/use-request-text";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RequestItem } from "@/services/approvals/queries";

export function AwaitingCarousel({ items }: { items: RequestItem[] }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const tp = useTranslations("payment");
  const locale = useLocale();
  const text = useRequestText();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { run } = useAction();

  function act(item: RequestItem, decision: "APPROVE" | "REJECT") {
    setBusy(`${item.requestId}:${decision}`);
    run(() => decide({ requestId: item.requestId, decision }), {
      success: decision === "APPROVE" ? tc("approve") + " ✓" : undefined,
      onSuccess: () => setBusy(null),
    });
    setTimeout(() => setBusy(null), 4000);
  }

  return (
    <section className="mx-4 mt-6 flex flex-col gap-3.5 rounded-lg bg-inverse py-4 text-inverse-foreground">
      <div className="flex items-center justify-between px-4">
        <span className="text-xs font-semibold tracking-[0.06em] text-inverse-muted uppercase">
          {t("waiting", { count: items.length })}
        </span>
        <Link href="/inbox" className="text-[13px] font-medium">
          {tc("seeAll")}
        </Link>
      </div>
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {items.map((item) => (
          <div key={item.requestId} className="flex w-full shrink-0 snap-center flex-col gap-3.5 px-4">
            <Link href={item.url} className="flex flex-col gap-1">
              <span className="text-lg leading-snug font-bold tracking-[-0.02em]">{text(item, "awaiting")}</span>
              <span className="text-[13px] text-inverse-muted">
                {[
                  item.method ? tp(`methods.${item.method as "CASH"}`) : null,
                  relativeTime(item.createdAt, locale),
                  item.title,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
            <div className="flex gap-2">
              <Button
                variant="inverse-outline"
                className="h-11 flex-1"
                disabled={busy !== null}
                onClick={() => act(item, "REJECT")}
              >
                {busy === `${item.requestId}:REJECT` ? <Loader2 className="animate-spin" /> : null}
                {tc("reject")}
              </Button>
              <Button
                variant="inverse"
                className="h-11 flex-2"
                disabled={busy !== null}
                onClick={() => act(item, "APPROVE")}
              >
                {busy === `${item.requestId}:APPROVE` ? <Loader2 className="animate-spin" /> : null}
                {tc("confirm")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="flex justify-center gap-1.25" aria-hidden>
          {items.map((it, i) => (
            <span
              key={it.requestId}
              className={cn(
                "h-1 rounded-full transition-all",
                i === index ? "w-4 bg-inverse-foreground" : "w-1 bg-inverse-line",
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
