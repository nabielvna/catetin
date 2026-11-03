"use client";
import { Camera, CameraOff, Flashlight, FlashlightOff, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { capture, focusAt, openBackCamera, pointInVideo } from "@/components/scan/camera";
import { TopBar } from "@/components/scan/parts";
import { BarButton } from "@/components/scan/parts";
import { type Original, originalFrom, type ScanPhoto } from "@/components/scan/photo";
import { SCAN_MAX_PHOTOS } from "@/domain/receipt";
import { cn } from "@/lib/utils";
export function CameraStage({
  title,
  hint,
  count,
  last,
  onClose,
  onBack,
  onOriginals,
}: {
  title: string;
  hint: string;
  count: number;
  last: ScanPhoto | undefined;
  onClose: () => void;
  onBack: (() => void) | null;
  onOriginals: (list: Original[]) => Promise<void>;
}) {
  const t = useTranslations("scan");
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [state, setState] = useState<"starting" | "ready" | "failed">("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [tapFocus, setTapFocus] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number; key: number } | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        const cam = await openBackCamera();
        stream = cam.stream;

        if (cancelled || !video.current) return void cam.stream.getTracks().forEach((tr) => tr.stop());
        video.current.srcObject = stream;
        await video.current.play();
        track.current = cam.track;
        if (!cancelled) {
          setTorch(cam.torch ? false : null);
          setTapFocus(cam.tapFocus);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      track.current = null;
    };
  }, []);

  async function shoot() {
    const v = video.current;
    const tr = track.current;
    if (!v || !tr || v.readyState < 2 || busy) return;
    setBusy(true);
    setFlash(true);
    navigator.vibrate?.(12);
    try {
      await onOriginals([await capture(tr, v)]);
    } finally {
      setBusy(false);
    }
  }

  async function fromFiles(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, SCAN_MAX_PHOTOS - count);
    if (list.length === 0) return;
    setBusy(true);
    try {
      const out = await Promise.all(list.map((f) => originalFrom(f).catch(() => null)));
      const ok = out.filter((o): o is Original => o !== null);
      if (ok.length) await onOriginals(ok);
    } finally {
      setBusy(false);
    }
  }

  const fileInputs = (
    <>
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple={SCAN_MAX_PHOTOS - count > 1}
        className="hidden"
        onChange={(e) => {
          void fromFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={native}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void fromFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  if (state === "failed") {
    return (
      <>
        <TopBar onClose={onClose} title={title} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
            <CameraOff className="size-7" />
          </span>
          <p className="text-lg font-semibold">{t("cameraFailed")}</p>
          <p className="text-sm text-balance text-white/60">{t("cameraFailedHint")}</p>
        </div>
        <div className="flex flex-col gap-2 px-5 pb-safe-8">
          <BarButton primary wide disabled={busy} onClick={() => native.current?.click()}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {t("nativeCamera")}
          </BarButton>
          <BarButton wide disabled={busy} onClick={() => gallery.current?.click()}>
            <ImageIcon className="size-5" /> {t("gallery")}
          </BarButton>
        </div>
        {fileInputs}
      </>
    );
  }

  const round = "flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-md";
  return (
    <>
      {}
      <video
        ref={video}
        playsInline
        muted
        onPointerDown={(e) => {
          const v = video.current;
          const tr = track.current;
          if (!tapFocus || !v || !tr || state !== "ready") return;
          const p = pointInVideo(v, e.clientX, e.clientY);
          setRing({ x: e.clientX, y: e.clientY, key: e.timeStamp });
          void focusAt(tr, p.x, p.y);
        }}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300",
          state === "ready" ? "opacity-100" : "opacity-0",
        )}
      />
      {ring ? (
        <span
          key={ring.key}
          aria-hidden
          onAnimationEnd={() => setRing(null)}
          style={{ left: ring.x, top: ring.y }}
          className="pointer-events-none fixed z-10 size-16 -translate-x-1/2 -translate-y-1/2 animate-focus rounded-full border-2 border-[#fcd34d]"
        />
      ) : null}

      {}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.25rem)] bottom-[calc(env(safe-area-inset-bottom)+9.75rem)]"
      >
        <div className="relative size-full rounded-[28px] shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]">
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <span
              key={c}
              className={cn(
                "absolute size-12 border-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
                c === "tl" && "-top-0.5 -left-0.5 rounded-tl-[28px] border-t-4 border-l-4",
                c === "tr" && "-top-0.5 -right-0.5 rounded-tr-[28px] border-t-4 border-r-4",
                c === "bl" && "-bottom-0.5 -left-0.5 rounded-bl-[28px] border-b-4 border-l-4",
                c === "br" && "-right-0.5 -bottom-0.5 rounded-br-[28px] border-r-4 border-b-4",
              )}
            />
          ))}
          <div className="absolute inset-x-3 top-3 flex justify-center">
            <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-center text-[13px] leading-snug font-medium text-balance backdrop-blur-md">
              {hint}
            </span>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex justify-center">
            <span className="rounded-full bg-black/45 px-3 py-1 text-center text-xs text-white/85 backdrop-blur-md">
              {t(tapFocus ? "hintFocusTap" : "hintFocus")}
            </span>
          </div>
        </div>
      </div>
      {flash ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-flash bg-white"
          onAnimationEnd={() => setFlash(false)}
        />
      ) : null}
      {state === "starting" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-white/60" />
        </div>
      ) : null}

      {}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-linear-to-b from-black/70 to-transparent px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-6">
        <button type="button" aria-label={t("close")} onClick={onClose} className={round}>
          <X className="size-5" />
        </button>
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {count > 0 ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold num">
              {count + 1}/{SCAN_MAX_PHOTOS}
            </span>
          ) : null}
        </span>
        {torch !== null ? (
          <button
            type="button"
            aria-label={t("torch")}
            aria-pressed={torch}
            onClick={() => {
              const on = !torch;
              void track.current
                ?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
                .then(() => setTorch(on))
                .catch(() => setTorch(null));
            }}
            className={cn(round, torch && "bg-white text-black")}
          >
            {torch ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {}
      <div className="absolute inset-x-0 bottom-0 z-10 grid grid-cols-3 items-center bg-linear-to-t from-black/80 via-black/50 to-transparent px-6 pt-10 pb-safe-8">
        <button
          type="button"
          disabled={busy}
          onClick={() => gallery.current?.click()}
          className="flex flex-col items-center gap-1.5 justify-self-start text-[11px] font-medium text-white/85"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md">
            <ImageIcon className="size-5" />
          </span>
          {t("galleryShort")}
        </button>
        <button
          type="button"
          aria-label={t("shutter")}
          disabled={state !== "ready" || busy}
          onClick={() => void shoot()}
          className="flex size-19 items-center justify-center justify-self-center rounded-full ring-4 ring-white transition-transform active:scale-95 disabled:opacity-50"
        >
          <span className="flex size-15.5 items-center justify-center rounded-full bg-white text-black">
            {busy ? <Loader2 className="size-6 animate-spin" /> : null}
          </span>
        </button>
        {onBack && last ? (
          <button
            type="button"
            onClick={onBack}
            className="flex flex-col items-center gap-1.5 justify-self-end text-[11px] font-medium text-white/85"
          >
            <span className="relative size-12 overflow-hidden rounded-2xl ring-2 ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={last.url} alt="" className="size-full object-cover" />
              <span className="absolute right-0.5 bottom-0.5 min-w-4 rounded-full bg-black/75 px-1 text-center text-[10px] font-bold">
                {count}
              </span>
            </span>
            {t("reviewShort")}
          </button>
        ) : (
          <span />
        )}
      </div>
      {fileInputs}
    </>
  );
}
