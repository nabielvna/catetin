"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { preloadHandlers } from "@/components/assistant/preload";
import { assistantStore, openAssistant } from "@/components/assistant/store";
import { cn } from "@/lib/utils";

export function AssistantButton({ className }: { className?: string }) {
  const t = useTranslations("assistant");
  const active = assistantStore.useStore((s) => s.active);
  return (
    <button
      type="button"
      aria-label={active ? t("resume") : t("open")}
      onClick={() => openAssistant()}
      {...preloadHandlers}
      className={cn(
        "no-print flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-soft",
        active && "text-ai",
        className,
      )}
    >
      <Sparkles className="size-5.5" strokeWidth={1.8} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
