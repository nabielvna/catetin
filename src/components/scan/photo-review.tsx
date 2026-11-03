"use client";
import { X } from "lucide-react";
import { Camera, Crop, Loader2, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Adjusting } from "@/components/scan/crop-view";
import { TopBar } from "@/components/scan/parts";
import { BarButton } from "@/components/scan/parts";
import { type Filter, type ScanPhoto, type Shot } from "@/components/scan/photo";
import type { ScanPurpose } from "@/components/scan/scan-dialog";
import { SCAN_MAX_PHOTOS } from "@/domain/receipt";
import { cn } from "@/lib/utils";
export function Thumbs({
  photos,
  sel,
  onSelect,
  onRemove,
}: {
  photos: ScanPhoto[];
  sel: number;
  onSelect: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const t = useTranslations("scan");
  if (photos.length < 2) return null;
  return (
    <div className="flex justify-center gap-3 px-4 pt-2">
      {photos.map((p, i) => (
        <div key={p.id} className="relative">
          <button
            type="button"
            aria-label={t("photoN", { n: i + 1 })}
            aria-pressed={i === sel}
            onClick={() => onSelect(i)}
            className={cn(
              "block size-14 overflow-hidden rounded-md ring-2 ring-offset-2 ring-offset-black",
              i === sel ? "ring-white" : "opacity-60 ring-transparent",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="size-full object-cover" />
          </button>
          <button
            type="button"
            aria-label={t("remove")}
            onClick={() => onRemove(i)}
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-white text-black"
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function PhotoReview({
  photos,
  shots,
  sel,
  setSel,
  removePhoto,
  rendering,
  changeFilter,
  setAdjusting,
  setStage,
  close,
  read,
  purpose,
}: {
  photos: ScanPhoto[];
  shots: Shot[];
  sel: number;
  setSel: (index: number) => void;
  removePhoto: (index: number) => void;
  rendering: boolean;
  changeFilter: (filter: Filter) => Promise<void>;
  setAdjusting: (value: Adjusting) => void;
  setStage: (stage: "adjust" | "camera") => void;
  close: () => void;
  read: () => Promise<void>;
  purpose: ScanPurpose | "capture";
}) {
  const t = useTranslations("scan");
  return (
    <>
      <TopBar onClose={close} title={t("reviewTitle")} />
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[sel]!.url}
          alt=""
          className={cn(
            "max-h-full max-w-full rounded-lg object-contain transition-opacity",
            rendering && "opacity-50",
          )}
        />
        {rendering ? <Loader2 className="absolute size-8 animate-spin" /> : null}
      </div>
      <Thumbs photos={photos} sel={sel} onSelect={setSel} onRemove={removePhoto} />
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <div role="radiogroup" aria-label={t("filter")} className="flex gap-1 rounded-full bg-white/12 p-1">
          {(["doc", "orig"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={shots[sel]!.filter === f}
              disabled={rendering}
              onClick={() => void changeFilter(f)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold transition-colors",
                shots[sel]!.filter === f ? "bg-white text-black" : "text-white/80",
              )}
            >
              {t(f === "doc" ? "filterDoc" : "filterOrig")}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={rendering}
          onClick={() => {
            const s = shots[sel]!;
            setAdjusting({ original: s.original, quad: s.quad, detected: true, replaceId: s.id });
            setStage("adjust");
          }}
          className="flex h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold"
        >
          <Crop className="size-4" /> {t("crop")}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-safe-6">
        <BarButton
          onClick={() => {
            removePhoto(sel);
            setStage("camera");
          }}
        >
          <RotateCcw className="size-5" />
          {t("retake")}
        </BarButton>
        <BarButton disabled={photos.length >= SCAN_MAX_PHOTOS} onClick={() => setStage("camera")}>
          <Plus className="size-5" />
          {t("addMore")}
        </BarButton>
        <BarButton primary onClick={() => void read()}>
          {purpose === "capture" ? <Camera className="size-5" /> : <Sparkles className="size-5" />}
          {purpose === "capture" ? t("send") : t("use")}
        </BarButton>
      </div>
    </>
  );
}
