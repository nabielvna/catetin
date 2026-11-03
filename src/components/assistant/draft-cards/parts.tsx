"use client";
import { Check, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/actions/action";
import { Button } from "@/components/ui/button";
import { type Currency, fromMajor, isCurrency } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Directory, Output } from "@/services/assistant/types";

export function savedMoney(output: Output, fallback: { amount: number; currency: Currency } | null, locale: string) {
  const value = output.amount ?? output.total;
  if (value !== undefined && output.currency && isCurrency(output.currency))
    return money(fromMajor(value, output.currency), output.currency, locale);
  return fallback ? money(fromMajor(fallback.amount, fallback.currency), fallback.currency, locale) : "";
}

export function useSave() {
  const te = useTranslations("errors");
  const [pending, setPending] = useState(false);
  async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<T | null> {
    setPending(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(te(r.code));
        return null;
      }
      window.dispatchEvent(new CustomEvent("catetin:refresh"));
      return r.data;
    } catch {
      toast.error(te("NETWORK"));
      return null;
    } finally {
      setPending(false);
    }
  }
  return { pending, run };
}

export function Shell({ title, children, done }: { title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-lg border p-3.5", done ? "border-line bg-soft" : "border-foreground")}
    >
      <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</span>
      {children}
    </div>
  );
}

export function ReviewActions({
  live,
  onCancel,
  onReview,
}: {
  live: boolean;
  onCancel: () => void;
  onReview: () => void;
}) {
  const t = useTranslations("assistant.draft");
  if (!live) return <span className="text-sm text-muted-foreground">{t("expired")}</span>;
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button size="sm" className="ml-auto" onClick={onReview}>
        {t("review")}
      </Button>
    </div>
  );
}

export function ResultRow({
  output,
  href,
  onUndo,
  name,
}: {
  output: Output;
  href?: string;
  onUndo?: () => Promise<boolean>;
  name?: string;
}) {
  const t = useTranslations("assistant.draft");
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (output.status === "cancelled") return <span className="text-sm text-muted-foreground">{t("cancelled")}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Check className="size-4 text-pos" />
        {undone ? t("undone") : output.pending ? t("savedPending", { name: name ?? "" }) : t("saved")}
      </span>
      {!undone && href ? (
        <Button asChild size="xs" variant="outline" className="ml-auto">
          <Link href={href}>
            <ExternalLink className="size-3.5" /> {t("view")}
          </Link>
        </Button>
      ) : null}
      {!undone && onUndo ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await onUndo()) setUndone(true);
            setBusy(false);
          }}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} {t("undo")}
        </Button>
      ) : null}
    </div>
  );
}

export type DraftProps<I> = {
  input: I;
  output?: Output;
  dir: Directory;

  photo?: string;

  live: boolean;
  onCancel: () => void;
  onReview: (href: string) => void;
};
