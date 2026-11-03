"use client";
import { Check, Crop, Expand, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { fullQuad, type Quad } from "@/components/scan/document";
import { TopBar } from "@/components/scan/parts";
import { BarButton } from "@/components/scan/parts";
import { type Original } from "@/components/scan/photo";
import { cn } from "@/lib/utils";
export type Adjusting = { original: Original; quad: Quad; detected: boolean; replaceId: string | null };

export function AdjustStage({
  adjusting,
  onClose,
  onCancel,
  onApply,
}: {
  adjusting: Adjusting;
  onClose: () => void;
  onCancel: () => void;
  onApply: (quad: Quad) => Promise<void>;
}) {
  const t = useTranslations("scan");
  const { original, detected, replaceId } = adjusting;
  const [quad, setQuad] = useState<Quad>(adjusting.quad);
  const [drag, setDrag] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const full = fullQuad(original.width, original.height);
  const isFull = quad.every((p, i) => Math.abs(p.x - full[i]!.x) < 1 && Math.abs(p.y - full[i]!.y) < 1);

  const move = (i: number, clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * original.width;
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height)) * original.height;
    setQuad((q) => q.map((p, j) => (j === i ? { x, y } : p)) as Quad);
  };

  const ZOOM = 2.5;
  const LOUPE = 112;
  const active = drag !== null ? quad[drag]! : null;

  return (
    <>
      <TopBar onClose={onClose} title={t("adjustTitle")} />
      <div className="flex justify-center px-6 pb-2">
        <span className="rounded-full bg-white/12 px-3.5 py-1.5 text-center text-[13px] text-white/85">
          {t(detected ? "adjustDetected" : "adjustHint")}
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 py-3">
        <div ref={box} className="relative touch-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={original.url}
            alt=""
            draggable={false}
            className="block max-h-[calc(100dvh-17rem)] max-w-[calc(100vw-3rem)] rounded-sm"
          />
          <svg
            aria-hidden
            viewBox={`0 0 ${original.width} ${original.height}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <path
              fillRule="evenodd"
              fill="rgba(0,0,0,0.55)"
              d={`M0 0H${original.width}V${original.height}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
            />
            <polygon
              points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {quad.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={t("corner", { n: i + 1 })}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setRect(box.current?.getBoundingClientRect() ?? null);
                setDrag(i);
              }}
              onPointerMove={(e) => drag === i && move(i, e.clientX, e.clientY)}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
              style={{ left: `${(p.x / original.width) * 100}%`, top: `${(p.y / original.height) * 100}%` }}
              className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            >
              <span
                className={cn(
                  "size-6 rounded-full border-[3px] border-white bg-[#60a5fa]/60 shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-transform",
                  drag === i && "scale-125",
                )}
              />
            </button>
          ))}
          {active && rect ? (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute -top-2 overflow-hidden rounded-full border-2 border-white shadow-lg",
                active.x < original.width / 2 ? "right-0" : "left-0",
              )}
              style={{
                width: LOUPE,
                height: LOUPE,
                backgroundImage: `url(${original.url})`,
                backgroundSize: `${rect.width * ZOOM}px ${rect.height * ZOOM}px`,
                backgroundPosition: `${LOUPE / 2 - (active.x / original.width) * rect.width * ZOOM}px ${
                  LOUPE / 2 - (active.y / original.height) * rect.height * ZOOM
                }px`,
              }}
            >
              <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#60a5fa]" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pt-2 pb-safe-6">
        <BarButton onClick={onCancel} disabled={busy}>
          <RotateCcw className="size-5" />
          {replaceId ? t("cancel") : t("retake")}
        </BarButton>
        <BarButton disabled={busy} onClick={() => setQuad(isFull ? adjusting.quad : full)}>
          {isFull ? <Crop className="size-5" /> : <Expand className="size-5" />}
          {isFull ? t("adjustAuto") : t("adjustFull")}
        </BarButton>
        <BarButton
          primary
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(quad);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          {t("next")}
        </BarButton>
      </div>
    </>
  );
}
