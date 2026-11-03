"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { attach } from "@/actions/files";
import { releasePhotos, type ScanPhoto } from "@/components/scan/photo";
import type { Receipt } from "@/domain/receipt";

type Target = { type: "OBLIGATION" | "SETTLEMENT" | "BILL"; id: string };

export function useScan<F extends string>() {
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<F>>(new Set());
  const [attachPhotos, setAttachPhotos] = useState(true);

  const current = useRef(photos);
  useEffect(() => {
    current.current = photos;
  }, [photos]);
  useEffect(() => () => releasePhotos(current.current), []);

  const apply = useCallback((r: Receipt, p: ScanPhoto[], fields: F[]) => {
    releasePhotos(current.current);
    setPhotos(p);
    setReceipt(r);
    setMarked(new Set(fields));
    setAttachPhotos(true);
  }, []);

  const unmark = useCallback(
    (field: F) =>
      setMarked((m) => {
        if (!m.has(field)) return m;
        const next = new Set(m);
        next.delete(field);
        return next;
      }),
    [],
  );

  const t = useTranslations("scan");

  const attachTo = useCallback(
    async (target: Target) => {
      if (!attachPhotos || photos.length === 0) return;
      const results = await Promise.all(
        photos.map(async (p) => {
          try {
            const body = new FormData();
            body.append("file", p.blob, "struk.jpg");
            const r = await fetch("/api/files", { method: "POST", body });
            if (!r.ok) return false;
            const { id } = (await r.json()) as { id: string };
            return (await attach({ fileId: id, target })).ok;
          } catch {
            return false;
          }
        }),
      );
      if (results.some((ok) => !ok)) toast.error(t("attachFailed"));
    },
    [attachPhotos, photos, t],
  );

  return { receipt, photos, marked, attachPhotos, setAttachPhotos, apply, unmark, attachTo };
}

export type ScanHook<F extends string> = ReturnType<typeof useScan<F>>;
