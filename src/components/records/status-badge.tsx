import { Check, Clock3, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function StatusPill({ status }: { status: "PENDING" | "ACTIVE" | "SETTLED" | "REJECTED" | "VOID" }) {
  const t = useTranslations("debt.status");
  const Icon =
    status === "PENDING"
      ? Clock3
      : status === "SETTLED"
        ? Check
        : status === "REJECTED" || status === "VOID"
          ? X
          : null;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs font-semibold",
        status === "PENDING" && "bg-soft text-foreground",
        status === "ACTIVE" && "bg-soft text-foreground",
        status === "SETTLED" && "bg-pos/12 text-pos",
        (status === "REJECTED" || status === "VOID") && "bg-neg/10 text-neg",
      )}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {t(status)}
    </span>
  );
}
