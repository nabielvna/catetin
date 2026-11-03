"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function TopBar({ title, onClose, right }: { title: string; onClose: () => void; right?: React.ReactNode }) {
  const t = useTranslations("scan");
  return (
    <div className="relative z-10 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="flex size-11 items-center justify-center rounded-full bg-white/10"
      >
        <X className="size-5" />
      </button>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="flex size-11 items-center justify-center">{right}</span>
    </div>
  );
}

export function BarButton({
  primary,
  wide,
  className,
  ...props
}: React.ComponentProps<"button"> & { primary?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-14 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-35",
        wide ? "flex-row text-base" : "flex-col gap-1",
        primary ? "bg-white text-black" : "bg-white/12 text-white",
        className,
      )}
      {...props}
    />
  );
}
