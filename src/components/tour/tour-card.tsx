"use client";

import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { currentScreen, session } from "@/components/assistant/session";
import { assistantStore } from "@/components/assistant/store";
import { setCardStatus, startTour, tourStore } from "@/components/tour/store";
import { Button } from "@/components/ui/button";
import { isTourId, type Tour, type TourParams, TOURS } from "@/lib/tours";
import { cn } from "@/lib/utils";
import type { Directory } from "@/services/assistant/types";

export type TourInput = { tour: string } & TourParams;

export function TourCard({ id, input, dir }: { id: string; input: TourInput; dir: Directory }) {
  const t = useTranslations("tour");
  const status = tourStore.useStore((s) => s.cards[id]);
  if (!isTourId(input.tour)) return null;
  const tourId = input.tour;
  const def: Tour = TOURS[tourId];

  const screen = currentScreen();
  const params: TourParams = {
    partyId: input.partyId ?? screen.partyId,
    groupId: input.groupId ?? screen.groupId,
    debtId: input.debtId ?? screen.debtId,
    paymentId: input.paymentId ?? screen.paymentId,
  };
  const person = dir.people.find((p) => p.id === params.partyId)?.name;
  const group = dir.groups.find((g) => g.id === params.groupId)?.name;
  const vars = { name: person?.split(" ")[0] ?? t("card.someone"), group: group ?? t("card.someGroup") };
  const it = (key: string) => t(`items.${tourId}.${key}`, vars);
  const steps = def.steps.map((_, i) => it(`s${i + 1}`));
  const assist = def.assist !== null;

  function guide() {
    if (def.needs && !params[def.needs]) return toast(t(`card.needs.${def.needs}`));
    startTour({
      id: tourId,
      params,
      vars: { ...(person ? { name: vars.name } : {}), ...(group ? { group } : {}) },
      cardId: id,
    });
    assistantStore.set({ open: false });
  }

  const label = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] leading-relaxed">{t("card.intro", { count: assist ? 3 : 2, title: it("title") })}</p>
      <div className="flex flex-col rounded-lg border border-border">
        <section className="flex flex-col gap-2.5 p-3.5">
          <h3 className={label}>{t("card.self")}</h3>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-snug">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                  {i + 1}
                </span>
                <span className="flex-1 pt-px">{s}</span>
              </li>
            ))}
          </ol>
        </section>
        {assist ? (
          <section className="flex flex-col gap-2 border-t border-line p-3.5">
            <h3 className={label}>{t("card.assist")}</h3>
            <p className="text-sm leading-snug">
              {t.rich("card.assistBody", { ask: it("ask"), b: (c) => <b className="font-semibold">{c}</b> })}{" "}
              {t(
                def.assist === "review"
                  ? "card.assistReview"
                  : def.assist === "ask"
                    ? "card.assistAsk"
                    : "card.assistConfirm",
              )}
            </p>
            {status ? null : (
              <Button
                variant="outline"
                onClick={() => {
                  session.set({ draft: it("prefix") });
                  assistantStore.set({ intent: "type" });
                }}
              >
                <Sparkles className="size-4" strokeWidth={1.8} />
                {t(def.assist === "ask" ? "card.assistAskButton" : "card.assistButton")}
              </Button>
            )}
          </section>
        ) : null}
        <section className="flex flex-col gap-2 border-t border-line p-3.5">
          <h3 className={label}>{t("card.guide", { n: assist ? 3 : 2 })}</h3>
          <p className="text-sm leading-snug">{t("card.guideBody")}</p>
          {status === "done" ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Check className="size-4" strokeWidth={2.4} />
              {t("card.done")}
            </span>
          ) : status ? null : (
            <Button onClick={guide}>{t("card.guideButton")}</Button>
          )}
        </section>
        {status ? null : (
          <button
            type="button"
            onClick={() => setCardStatus(id, "dismissed")}
            className={cn(
              "h-10 border-t border-line text-[13px] font-semibold text-muted-foreground hover:bg-soft",
              "rounded-b-lg",
            )}
          >
            {t("card.dismiss")}
          </button>
        )}
      </div>
    </div>
  );
}
