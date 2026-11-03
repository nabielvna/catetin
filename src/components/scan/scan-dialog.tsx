"use client";
import { Camera, RotateCcw, ScanLine, Sparkles, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { CameraStage } from "@/components/scan/camera-view";
import type { Adjusting } from "@/components/scan/crop-view";
import { AdjustStage } from "@/components/scan/crop-view";
import { type Quad } from "@/components/scan/document";
import { TopBar } from "@/components/scan/parts";
import { BarButton } from "@/components/scan/parts";
import {
  autoQuad,
  CHAT_SIDE,
  type Filter,
  type Original,
  releaseShots,
  renderShot,
  SCAN_SIDE,
  type ScanPhoto,
  type Shot,
} from "@/components/scan/photo";
import { PhotoReview } from "@/components/scan/photo-review";
import type { Currency } from "@/domain/money";
import { isUsableScan, type Receipt, SCAN_MAX_PHOTOS } from "@/domain/receipt";
import { Link } from "@/i18n/navigation";
export type ScanPurpose = "bill" | "debt" | "payment";

type Stage = "notice" | "camera" | "adjust" | "review" | "reading" | "error";

type Failure = { code: string; resetAt?: string };

const NOTICE_KEY = "catetin:scan-notice";

const HISTORY_KEY = "catetinScan";

const isMarked = (state: unknown) => Boolean((state as Record<string, unknown> | null)?.[HISTORY_KEY]);

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function ScanFlow(
  props: { onClose: () => void } & (
    | { purpose: ScanPurpose; currency: Currency; onResult: (receipt: Receipt, photos: ScanPhoto[]) => void }
    | { purpose: "capture"; onPhotos: (photos: ScanPhoto[]) => void }
  ),
) {
  const { onClose, purpose } = props;
  const t = useTranslations("scan");
  const format = useFormatter();
  const transfer = purpose === "payment";
  const [stage, setStage] = useState<Stage>(() => (purpose === "capture" || noticeSeen() ? "camera" : "notice"));
  const [shots, setShots] = useState<Shot[]>([]);
  const photos = shots.map((s) => s.photo);
  const [sel, setSel] = useState(0);
  const [adjusting, setAdjusting] = useState<Adjusting | null>(null);
  const [filter, setFilter] = useState<Filter>("doc");
  const [rendering, setRendering] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const maxSide = purpose === "capture" ? CHAT_SIDE : SCAN_SIDE;

  const owned = useRef<{ shots: Shot[]; adjusting: Adjusting | null }>({ shots: [], adjusting: null });
  useEffect(() => {
    owned.current = { shots, adjusting };
  }, [shots, adjusting]);
  const handedOver = useRef(false);
  useEffect(
    () => () => {
      const { shots: all, adjusting: a } = owned.current;
      if (handedOver.current) all.forEach((s) => URL.revokeObjectURL(s.original.url));
      else releaseShots(all);
      if (a && !a.replaceId) URL.revokeObjectURL(a.original.url);
    },
    [],
  );

  const closeFromBack = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!isMarked(window.history.state)) window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
    const onPop = (e: PopStateEvent) => {
      if (!isMarked(e.state)) closeFromBack();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const close = () => (isMarked(window.history.state) ? window.history.back() : onClose());

  async function addOriginals(list: Original[]) {
    const room = SCAN_MAX_PHOTOS - shots.length;
    list.slice(room).forEach((o) => URL.revokeObjectURL(o.url));
    const use = list.slice(0, room);
    if (use.length === 0) return;
    if (use.length === 1) {
      const { quad, detected } = await autoQuad(use[0]!);
      setAdjusting({ original: use[0]!, quad, detected, replaceId: null });
      setStage("adjust");
      return;
    }
    const made = await Promise.all(
      use.map(async (original) => {
        const { quad } = await autoQuad(original);
        const photo = await renderShot(original, quad, filter, maxSide);
        return { id: crypto.randomUUID(), original, quad, filter, photo };
      }),
    );
    setShots([...shots, ...made]);
    setSel(shots.length + made.length - 1);
    setStage("review");
  }

  async function applyAdjust(quad: Quad) {
    const a = adjusting!;
    const current = a.replaceId ? shots.find((s) => s.id === a.replaceId) : null;
    const f = current?.filter ?? filter;
    const photo = await renderShot(a.original, quad, f, maxSide);
    if (current) {
      URL.revokeObjectURL(current.photo.url);
      setShots(shots.map((s) => (s.id === current.id ? { ...s, quad, photo } : s)));
    } else {
      setShots([...shots, { id: crypto.randomUUID(), original: a.original, quad, filter: f, photo }]);
      setSel(shots.length);
    }
    setAdjusting(null);
    setStage("review");
  }

  function cancelAdjust() {
    const a = adjusting;
    setAdjusting(null);
    if (a && !a.replaceId) {
      URL.revokeObjectURL(a.original.url);
      setStage("camera");
    } else setStage("review");
  }

  async function changeFilter(f: Filter) {
    const s = shots[sel];
    setFilter(f);
    if (!s || s.filter === f) return;
    setRendering(true);
    try {
      const photo = await renderShot(s.original, s.quad, f, maxSide);
      URL.revokeObjectURL(s.photo.url);
      setShots((all) => all.map((x) => (x.id === s.id ? { ...x, filter: f, photo } : x)));
    } finally {
      setRendering(false);
    }
  }

  const removePhoto = (i: number) => {
    releaseShots([shots[i]!]);
    const next = shots.filter((_, j) => j !== i);
    setShots(next);
    setSel(Math.max(0, Math.min(sel, next.length - 1)));
    if (next.length === 0) setStage("camera");
  };

  const content = useRef<HTMLDivElement>(null);
  const reading = useRef<AbortController | null>(null);
  async function read() {
    if (props.purpose === "capture") {
      handedOver.current = true;
      props.onPhotos(photos);
      close();
      return;
    }
    setStage("reading");
    const ac = new AbortController();
    reading.current = ac;
    const body = new FormData();
    for (const p of photos) body.append("photo", p.blob, "struk.jpg");
    body.set("purpose", props.purpose);
    body.set("currency", props.currency);
    try {
      const res = await fetch("/api/scan", { method: "POST", body, signal: ac.signal });
      const json = (await res.json().catch(() => ({}))) as { receipt?: Receipt; code?: string; resetAt?: string };
      if (!res.ok || !json.receipt) throw { code: json.code ?? "SCAN_FAILED", resetAt: json.resetAt } as Failure;
      if (!isUsableScan(json.receipt)) throw { code: "NOT_RECEIPT" } as Failure;
      handedOver.current = true;
      props.onResult(json.receipt, photos);
      close();
    } catch (e) {
      if (ac.signal.aborted) return;
      setFailure(typeof e === "object" && e && "code" in e ? (e as Failure) : { code: "NETWORK" });
      setStage("error");
    }
  }

  const failureText = (f: Failure) => {
    switch (f.code) {
      case "NOT_RECEIPT":
        return [t(transfer ? "notTransfer" : "notReceipt"), t("notReceiptHint")];
      case "ASSISTANT_QUOTA":
        return [
          t("quota", {
            time: f.resetAt ? format.dateTime(new Date(f.resetAt), { hour: "2-digit", minute: "2-digit" }) : "—",
          }),
          t("manualHint"),
        ];
      case "ASSISTANT_BUSY":
      case "RATE_LIMITED":
        return [t("busy"), t("manualHint")];
      case "ASSISTANT_DISABLED":
        return [t("disabled"), t("manualHint")];
      case "NETWORK":
        return [t("network"), t("failedHint")];
      default:
        return [t("failed"), t("failedHint")];
    }
  };

  const title = purpose === "capture" ? t("titleCapture") : t(transfer ? "titleTransfer" : "title");

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={content}
          aria-describedby={undefined}

          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-60 flex flex-col overflow-hidden bg-black text-white outline-none select-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          {stage === "notice" ? (
            <Notice
              onOk={() => {
                try {
                  localStorage.setItem(NOTICE_KEY, "1");
                } catch {}
                setStage("camera");
              }}
              onClose={close}
            />
          ) : stage === "camera" ? (
            <CameraStage
              title={title}
              hint={photos.length > 0 ? t("hintMore") : t(transfer ? "hintTransfer" : "hint")}
              count={photos.length}
              last={photos.at(-1)}
              onClose={close}
              onBack={photos.length > 0 ? () => setStage("review") : null}
              onOriginals={addOriginals}
            />
          ) : stage === "adjust" && adjusting ? (
            <AdjustStage
              key={adjusting.original.url}
              adjusting={adjusting}
              onClose={close}
              onCancel={cancelAdjust}
              onApply={applyAdjust}
            />
          ) : stage === "review" && photos[sel] ? (
            <PhotoReview
              photos={photos}
              shots={shots}
              sel={sel}
              setSel={setSel}
              removePhoto={removePhoto}
              rendering={rendering}
              changeFilter={changeFilter}
              setAdjusting={setAdjusting}
              setStage={setStage}
              close={close}
              read={read}
              purpose={purpose}
            />
          ) : stage === "reading" ? (
            <>
              <TopBar onClose={close} title={title} />
              <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-4">
                <div className="relative max-h-full overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photos[sel]?.url ?? photos[0]!.url}
                    alt=""
                    className="block max-h-[calc(100dvh-16rem)] max-w-full object-contain opacity-70"
                  />
                  <div aria-hidden className="absolute inset-x-0 h-0 animate-scan">
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-[#60a5fa]/45" />
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[#93c5fd] shadow-[0_0_12px_2px_#60a5fa]" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 px-6 pt-2 pb-safe-8 text-center" role="status">
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="size-5 animate-pulse text-[#93c5fd]" />
                  {t(transfer ? "readingTransfer" : "reading")}
                </p>
                <p className="text-sm text-white/60">{t("readingHint")}</p>
                <button
                  type="button"
                  className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
                  onClick={() => {
                    reading.current?.abort();
                    setStage("review");
                  }}
                >
                  {t("cancel")}
                </button>
              </div>
            </>
          ) : stage === "error" && failure ? (
            <>
              <TopBar onClose={close} title={title} />
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
                  <TriangleAlert className="size-7" />
                </span>
                <p className="text-lg font-semibold text-balance">{failureText(failure)[0]}</p>
                <p className="text-sm text-balance text-white/60">{failureText(failure)[1]}</p>
              </div>
              <div className="flex flex-col gap-2 px-5 pb-safe-8">
                {failure.code === "NOT_RECEIPT" ? (
                  <BarButton
                    primary
                    wide
                    onClick={() => {
                      releaseShots(shots);
                      setShots([]);
                      setSel(0);
                      setStage("camera");
                    }}
                  >
                    <Camera className="size-5" /> {t("retakeAll")}
                  </BarButton>
                ) : failure.code !== "ASSISTANT_QUOTA" && failure.code !== "ASSISTANT_DISABLED" ? (
                  <BarButton primary wide onClick={() => void read()}>
                    <RotateCcw className="size-5" /> {t("tryAgain")}
                  </BarButton>
                ) : null}
                <BarButton wide onClick={close}>
                  {t("manual")}
                </BarButton>
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Notice({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  const t = useTranslations("scan");
  return (
    <>
      <TopBar onClose={onClose} title="" />
      <div className="flex flex-1 flex-col justify-end gap-4 px-6 pb-safe-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/10">
          <ScanLine className="size-6" />
        </span>
        <h2 className="text-2xl font-bold tracking-[-0.02em]">{t("noticeTitle")}</h2>
        <p className="text-[15px] leading-relaxed text-white/75">{t("notice")}</p>
        <Link href="/privacy" target="_blank" className="self-start text-sm font-semibold underline">
          {t("privacy")}
        </Link>
        <div className="mt-4 flex flex-col gap-2">
          <BarButton primary wide onClick={onOk}>
            {t("noticeOk")}
          </BarButton>
          <BarButton wide onClick={onClose}>
            {t("manual")}
          </BarButton>
        </div>
      </div>
    </>
  );
}
