"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { accept } from "@/actions/invites";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { formatDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvitePreview } from "@/services/invites";

export function AcceptInvite({ token, preview, locale }: { token: string; preview: InvitePreview; locale: string }) {
  const t = useTranslations("invite");
  const tm = useTranslations("money");
  const tg = useTranslations("groups");
  const router = useRouter();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const { pending, run } = useAction();
  const disputable = preview.items.filter((i) => i.disputable);
  const checkedCount = preview.items.length - unchecked.size;

  const title =
    preview.kind === "CONNECT"
      ? t("connectTitle", { inviter: preview.inviterName })
      : preview.kind === "GROUP"
        ? t("groupTitle", { group: preview.groupName ?? "" })
        : t("claimTitle", { inviter: preview.inviterName });
  const sub =
    preview.kind === "CONNECT"
      ? t("connectSub")
      : preview.kind === "GROUP"
        ? `${t("groupSub", { inviter: preview.inviterName })} ${tg("joinAgree", { mode: tg(`modes.${preview.groupMode ?? "CONFIRM"}`) })}`
        : t("claimSub", { inviter: preview.inviterName, name: preview.placeholderName ?? "" });

  return (
    <div className="flex flex-col gap-6 pt-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">{title}</h1>
        <p className="text-[15px] text-muted-foreground">{sub}</p>
      </div>
      {preview.items.length > 0 ? (
        <ul>
          {preview.items.map((it) => {
            const on = !unchecked.has(it.id);
            return (
              <li key={it.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={!it.disputable}
                  onClick={() => {
                    const next = new Set(unchecked);
                    if (on) next.add(it.id);
                    else next.delete(it.id);
                    setUnchecked(next);
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left disabled:opacity-80"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-sm border",
                      on ? "border-foreground bg-foreground text-background" : "border-border",
                    )}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn("truncate text-[15px] font-semibold", !on && "text-muted-foreground line-through")}
                    >
                      {it.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatDate(it.occurredOn, locale)} ·{" "}
                      {it.direction === "I_OWE"
                        ? tm("youOweThem", { name: it.counterpartName })
                        : tm("theyOweYou", { name: it.counterpartName })}
                      {!it.disputable && it.direction === "I_OWE" ? ` · ${t("notDisputable")}` : ""}
                    </span>
                  </span>
                  <span className={cn("text-[15px] font-bold num", it.direction === "I_OWE" ? "text-neg" : "text-pos")}>
                    {money(it.amount - it.paid, it.currency, locale)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              accept({ token, disputedObligationIds: disputable.filter((i) => unchecked.has(i.id)).map((i) => i.id) }),
            { onSuccess: (d) => router.replace(d.redirect) },
          )
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {preview.items.length > 0 ? t("acceptCount", { count: checkedCount }) : t("accept")}
      </Button>
    </div>
  );
}
