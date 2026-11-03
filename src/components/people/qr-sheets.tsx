"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { makeInvite } from "@/actions/invites";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function QrCodeSvg({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((QR) =>
      QR.toString(value, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0a0a0a", light: "#ffffff" },
      }).then((s) => alive && setSvg(s)),
    );
    return () => {
      alive = false;
    };
  }, [value]);
  if (!svg) return <div className={`aspect-square animate-pulse rounded-lg bg-soft ${className ?? ""}`} />;
  return (
    <div
      className={`aspect-square overflow-hidden rounded-lg bg-white p-3 [&_svg]:size-full ${className ?? ""}`}
      role="img"
      aria-label="QR"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ConnectQrSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("invite");
  const ta = useTranslations("addPerson");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      const res = await makeInvite({ kind: "CONNECT" });
      if (alive && res.ok) setUrl(res.data.url);
    };
    void load();
    const id = setInterval(load, 9 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
      setUrl(null);
    };
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{ta("showQr")}</DrawerTitle>
          <DrawerDescription>{t("qrConnectHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="mx-auto w-full max-w-70 px-5 pb-8">
          {url ? (
            <QrCodeSvg value={url} />
          ) : (
            <div className="flex aspect-square items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

export function ScanQrSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("invite");
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const handle = (text: string) => {
      try {
        const u = new URL(text);
        if (u.origin === window.location.origin && u.pathname.includes("/invite/")) {
          stopped = true;
          window.location.href = u.pathname;
        }
      } catch {}
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
          .BarcodeDetector;
        const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
        const jsQR = detector ? null : (await import("jsqr")).default;
        const tick = async () => {
          if (stopped || !video.current) return;
          const v = video.current;
          if (v.readyState >= 2) {
            if (detector) {
              const codes = await detector.detect(v).catch(() => []);
              if (codes[0]) handle(codes[0].rawValue);
            } else if (jsQR) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(img.data, img.width, img.height);
                if (code) handle(code.data);
              }
            }
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError(t("cameraDenied"));
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      setError(null);
    };
  }, [open, t]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("scanTitle")}</DrawerTitle>
          <DrawerDescription>{t("scanHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-5 pb-8">
          {error ? (
            <p className="py-10 text-center text-sm text-neg">{error}</p>
          ) : (
            <video ref={video} className="aspect-square w-full rounded-lg bg-black object-cover" playsInline muted />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
