"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { openAssistant } from "@/components/assistant/store";
import { SAVED_EVENT } from "@/components/forms/use-action";
import { type ActiveTour, finishTour, stopTour, tourStore } from "@/components/tour/store";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { currentStep, onTourPath, resolvePath, targetsOf, type Tour, TOURS, type TourStep } from "@/lib/tours";
import { cn } from "@/lib/utils";

const LOST_MS = 8000;
const PAD = 6;
const NAV_H = 68;

type Box = { x: number; y: number; w: number; h: number };

function findTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)) {
    if (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}
const isVisible = (target: string) => findTarget(target) !== null;
const stepElement = (step: TourStep) =>
  targetsOf(step)
    .map(findTarget)
    .find((el) => el !== null) ?? null;

export function TourOverlay() {
  const active = tourStore.useStore((s) => s.active);
  const done = tourStore.useStore((s) => s.done);
  return createPortal(
    active ? (
      <Runner key={`${active.id}:${JSON.stringify(active.params)}:${active.cardId ?? ""}`} tour={active} />
    ) : done ? (
      <Done tour={done} />
    ) : null,
    document.body,
  );
}

function useTourText(tour: ActiveTour) {
  const t = useTranslations("tour");
  const vars = { name: t("card.someone"), group: t("card.someGroup"), ...tour.vars };
  const title = t(`items.${tour.id}.title`, vars);
  return {
    t,
    vars,
    title: title.charAt(0).toLocaleUpperCase() + title.slice(1),
    step: (i: number) => t(`items.${tour.id}.s${i + 1}`, vars),
  };
}

function Runner({ tour }: { tour: ActiveTour }) {
  const def: Tour = TOURS[tour.id];
  const text = useTourText(tour);
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState(-1);
  const [box, setBox] = useState<Box | null>(null);
  const stepRef = useRef(-1);
  const pathRef = useRef(pathname);

  const passed = useRef(new Set<number>());

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (!onTourPath(def, tour.params, pathname)) stopTour();
  }, [def, tour.params, pathname]);

  useEffect(() => {
    if (currentStep(def, tour.params, pathRef.current, isVisible, passed.current) >= 0) return;
    const start = def.start ?? def.steps[0]!.path;
    const href = start ? resolvePath(start, tour.params) : null;
    if (href && href !== pathRef.current) router.push(href);
  }, [def, tour.params, router]);

  useEffect(() => {
    let raf = 0;
    let seen = performance.now();
    const tick = (now: number) => {
      const s = currentStep(def, tour.params, pathRef.current, isVisible, passed.current);
      const el = s >= 0 ? stepElement(def.steps[s]!) : null;
      if (s !== stepRef.current) {
        stepRef.current = s;
        setStep(s);

        if (el && (def.steps[s]!.dim ?? true)) reveal(el);
      }
      if (el) {
        seen = now;
        const r = el.getBoundingClientRect();
        setBox((b) =>
          b && b.x === r.x && b.y === r.y && b.w === r.width && b.h === r.height
            ? b
            : { x: r.x, y: r.y, w: r.width, h: r.height },
        );
      } else {
        setBox(null);
        if (now - seen > LOST_MS) {
          stopTour();
          toast(text.t("lost"));
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, tour.params]);

  useEffect(() => {
    const last = def.steps.length - 1;
    const onClick = (e: MouseEvent) => {
      const s = stepRef.current;
      const st = def.steps[s];
      const el = st ? stepElement(st) : null;
      if (!st || !el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      if (st.gate) passed.current.add(s);
      if (s === last && (st.until ?? "tap") === "tap") finishTour();
    };
    const onSaved = () => {
      if (def.steps[stepRef.current]?.until === "saved") finishTour();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(SAVED_EVENT, onSaved);
    };
  }, [def]);

  const st = step >= 0 ? def.steps[step] : undefined;
  if (!st || !box) return null;
  const dim = st.dim ?? true;
  return (
    <>
      <Spotlight box={box} dim={dim} />
      <Bubble
        box={box}
        title={text.t("bubble.progress", { title: text.title, n: step + 1, total: def.steps.length })}
        body={text.step(step)}
        n={step}
        total={def.steps.length}
        stopLabel={text.t("bubble.stop")}
      />
    </>
  );
}

function reveal(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.top < 8 || r.bottom > window.innerHeight - NAV_H - 8)
    el.scrollIntoView({ block: "center", behavior: "smooth" });
}

function Spotlight({ box, dim }: { box: Box; dim: boolean }) {
  const hole = { left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 };
  const block = "pointer-events-auto fixed z-60";
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed z-60 rounded-xl transition-shadow duration-200",
          dim
            ? "shadow-[0_0_0_2px_#fff,0_0_0_9999px_rgba(10,10,10,0.55)] dark:shadow-[0_0_0_2px_#fafafa,0_0_0_9999px_rgba(0,0,0,0.72)]"
            : "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]",
        )}
        style={hole}
      />
      {dim ? (
        <>
          <div
            aria-hidden
            className={block}
            onClick={stopTour}
            style={{ left: 0, right: 0, top: 0, height: hole.top }}
          />
          <div
            aria-hidden
            className={block}
            onClick={stopTour}
            style={{ left: 0, right: 0, top: hole.top + hole.height, bottom: 0 }}
          />
          <div
            aria-hidden
            className={block}
            onClick={stopTour}
            style={{ left: 0, width: hole.left, top: hole.top, height: hole.height }}
          />
          <div
            aria-hidden
            className={block}
            onClick={stopTour}
            style={{ left: hole.left + hole.width, right: 0, top: hole.top, height: hole.height }}
          />
        </>
      ) : null}
    </>
  );
}

function Bubble(props: { box: Box; title: string; body: string; n: number; total: number; stopLabel: string }) {
  const { box } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const stop = (e: Event) => e.stopPropagation();
    el?.addEventListener("pointerdown", stop);
    return () => el?.removeEventListener("pointerdown", stop);
  }, []);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 24);
  const cx = box.x + box.w / 2;

  const docked = box.y > vh - NAV_H - 8 || box.y + box.h < 8;
  const left = docked ? (vw - width) / 2 : Math.min(Math.max(cx - width / 2, 12), vw - width - 12);
  const below = !docked && box.y + box.h / 2 < vh / 2;
  const arrow = Math.min(Math.max(cx - left - 6, 16), width - 28);
  return (
    <div
      ref={ref}
      data-slot="tour-bubble"
      className="pointer-events-auto fixed z-61 flex flex-col gap-2.5 rounded-xl bg-background p-3.5 pt-3 text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.24)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
      style={{
        left,
        width,
        ...(docked
          ? { bottom: NAV_H + 12 }
          : below
            ? { top: box.y + box.h + PAD + 12 }
            : { bottom: vh - box.y + PAD + 12 }),
      }}
    >
      {docked ? null : (
        <span
          aria-hidden
          className={cn("absolute size-3 rotate-45 bg-background", below ? "-top-1.5" : "-bottom-1.5")}
          style={{ left: arrow }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{props.title}</span>
        <button
          type="button"
          aria-label={props.stopLabel}
          onClick={stopTour}
          className="-mt-1 -mr-1.5 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-soft"
        >
          <X className="size-4" />
        </button>
      </div>
      <p role="status" className="text-[15px] leading-snug font-semibold">
        {props.body}
      </p>
      <div aria-hidden className="flex gap-1">
        {Array.from({ length: props.total }, (_, i) => (
          <span key={i} className={cn("h-0.75 flex-1 rounded-full", i <= props.n ? "bg-foreground" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

function Done({ tour }: { tour: ActiveTour }) {
  const text = useTourText(tour);
  const { t } = text;
  const def: Tour = TOURS[tour.id];
  const close = () => tourStore.set({ done: null });
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-60 bg-[rgba(10,10,10,0.55)] dark:bg-[rgba(0,0,0,0.72)]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-labelledby="tour-done-title"
        className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] mx-auto flex max-w-md animate-in flex-col gap-3 rounded-xl bg-background p-4.5 text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.24)] fade-in slide-in-from-bottom-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="size-4.5" strokeWidth={2.4} />
          </span>
          <span id="tour-done-title" className="text-base font-bold">
            {t("done.title")}
          </span>
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {t("done.body", { title: text.title })}
          {def.assist ? ` ${t("done.hint", { ask: t(`items.${tour.id}.ask`, text.vars) })}` : null}
        </p>
        <div className="flex gap-2">
          <Button autoFocus className="flex-1" onClick={close}>
            {t("done.ok")}
          </Button>
          {tour.cardId ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                close();
                openAssistant();
              }}
            >
              {t("done.back")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
