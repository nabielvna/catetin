"use client";
import { RotateCcw, ScanLine, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { ScanPurpose } from "@/components/scan/scan-dialog";
import type { ScanHook } from "@/components/scan/use-scan";
import { Checkbox } from "@/components/ui/checkbox";
import type { Currency } from "@/domain/money";
import type { Receipt } from "@/domain/receipt";
import { cn } from "@/lib/utils";
const loadFlow = () => import("@/components/scan/scan-dialog");

const ScanFlow = dynamic(loadFlow, { ssr: false });

export function ScanMark({ show }: { show: boolean }) {
  const t = useTranslations("scan");
  if (!show) return null;
  return <Sparkles aria-label={t("marked")} role="img" className="inline size-3.5 shrink-0 text-ai" />;
}

export function ScanSection<F extends string>({
  scan,
  purpose,
  currency,
  onResult,
  className,
}: {
  scan: ScanHook<F>;
  purpose: ScanPurpose;
  currency: Currency;

  onResult: (receipt: Receipt) => F[];
  className?: string;
}) {
  const t = useTranslations("scan");
  const [open, setOpen] = useState(false);
  const transfer = purpose === "payment";
  const warm = () => void loadFlow();

  return (
    <>
      {scan.receipt ? (
        <div className={cn("flex items-start gap-3 rounded-xl bg-soft p-3", className)}>
          <div className="relative h-16 w-12 shrink-0">
            {scan.photos.slice(0, 2).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt=""
                className={cn(
                  "absolute size-full rounded-md object-cover ring-2 ring-soft",
                  i === 1 && "translate-x-1.5 -translate-y-1.5 opacity-70",
                )}
                style={{ zIndex: 2 - i }}
              />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold">
              <Sparkles className="size-4 text-ai" />
              {t(transfer ? "filledTransfer" : "filled")}
            </p>
            <p className="text-[13px] leading-snug text-muted-foreground">{t("filledHint")}</p>
            {scan.receipt.deduped.length > 0 ? (
              <p className="text-[13px] leading-snug text-muted-foreground">
                {t("deduped", { count: scan.receipt.deduped.length, names: scan.receipt.deduped.join(", ") })}
              </p>
            ) : null}
            <label className="mt-2 flex items-center gap-2 text-[13px] font-medium">
              <Checkbox checked={scan.attachPhotos} onCheckedChange={(c) => scan.setAttachPhotos(c === true)} />
              {t("attach", { count: scan.photos.length })}
            </label>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            onPointerEnter={warm}
            className="-m-1 flex shrink-0 items-center gap-1 rounded-md p-1 text-[13px] font-semibold"
          >
            <RotateCcw className="size-3.5" /> {t("rescan")}
          </button>
        </div>
      ) : (
        <ScanCardButton
          purpose={purpose}
          className={className}
          data-tour="scan.open"
          onClick={() => setOpen(true)}
          onPointerEnter={warm}
          onTouchStart={warm}
          onFocus={warm}
        />
      )}
      {open ? (
        <ScanFlow
          purpose={purpose}
          currency={currency}
          onClose={() => setOpen(false)}
          onResult={(r, photos) => scan.apply(r, photos, onResult(r))}
        />
      ) : null}
    </>
  );
}

export function ScanCardButton({
  purpose,
  className,
  ...props
}: { purpose: ScanPurpose } & React.ComponentProps<"button">) {
  const t = useTranslations("scan");
  const transfer = purpose === "payment";
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-dashed border-foreground/25 px-3.5 py-3 text-left transition-colors hover:bg-soft",
        className,
      )}
      {...props}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <ScanLine className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold">{t(transfer ? "buttonTransfer" : "button")}</span>
        <span className="text-[13px] text-muted-foreground">{t(transfer ? "buttonHintTransfer" : "buttonHint")}</span>
      </span>
      <Sparkles className="ml-auto size-4 shrink-0 text-ai" />
    </button>
  );
}
