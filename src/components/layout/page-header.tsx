"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function PageHeader({
  title,
  action,
  fallbackHref = "/home",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  fallbackHref?: string;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-background/95 px-2 pt-safe backdrop-blur">
      <div className="flex h-14 min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label={t("back")}
          className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-soft"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(fallbackHref);
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
        {title ? <h1 className="truncate text-[17px] font-bold tracking-[-0.02em]">{title}</h1> : null}
      </div>
      <div className="flex items-center">{action}</div>
    </header>
  );
}
