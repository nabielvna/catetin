"use client";

import { Mic, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { preloadHandlers } from "@/components/assistant/preload";
import { assistantStore, type LaunchIntent, openAssistant } from "@/components/assistant/store";
import { cn } from "@/lib/utils";

export function AssistantBar({ className, onLaunch }: { className?: string; onLaunch?: (open: () => void) => void }) {
  const t = useTranslations("assistant");
  const active = assistantStore.useStore((s) => s.active);
  const launch = (intent: LaunchIntent) => (onLaunch ? onLaunch(() => openAssistant(intent)) : openAssistant(intent));
  return (
    <div
      className={cn(
        "flex h-13 items-center rounded-full border bg-soft pr-1.5 transition-colors",
        active ? "border-ai/50" : "border-border",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => launch("type")}
        {...preloadHandlers}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-full pl-4 text-left"
      >
        <Sparkles
          className={cn("size-4.5 shrink-0", active && "text-ai")}
          fill={active ? "currentColor" : "none"}
          aria-hidden
        />
        <span className={cn("truncate text-[15px]", active ? "text-foreground" : "text-muted-foreground")}>
          {active ? t("barResume") : t("barPlaceholder")}
        </span>
      </button>
      <button
        type="button"
        aria-label={t("voice")}
        onClick={() => launch("voice")}
        {...preloadHandlers}
        className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-foreground/5"
      >
        <Mic className="size-5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
