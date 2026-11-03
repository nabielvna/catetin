"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { attach, detach } from "@/actions/files";
import { PhotoPicker } from "@/components/forms/photo-picker";
import { useAction } from "@/components/forms/use-action";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { compressImage } from "@/lib/compress-image";

type Item = { id: string; fileId: string; mine: boolean; hidden: boolean };

export function Evidence({
  target,
  items,
  canAdd,
}: {
  target: { type: "OBLIGATION" | "SETTLEMENT" | "BILL"; id: string };
  items: Item[];
  canAdd: boolean;
}) {
  const t = useTranslations("evidence");
  const te = useTranslations("errors");
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const { run } = useAction();
  const visible = items.filter((i) => !i.hidden);
  const hiddenCount = items.length - visible.length;

  async function onFile(f: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", await compressImage(f), "photo.jpg");
      const res = await fetch("/api/files", { method: "POST", body });
      const json = (await res.json()) as { id?: string; code?: string };
      if (!res.ok || !json.id) {
        toast.error(te((json.code as "FILE_REJECTED") ?? "FILE_REJECTED"));
        return;
      }
      run(() => attach({ fileId: json.id!, target }));
    } catch {
      toast.error(te("NETWORK"));
    } finally {
      setUploading(false);
    }
  }

  if (!canAdd && items.length === 0) return null;
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-2 text-base font-bold">{t("title")}</h2>
      <div className="flex flex-wrap gap-2">
        {visible.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setOpen(it)}
            className="size-20 overflow-hidden rounded-md bg-soft"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${it.fileId}`} alt="" className="size-full object-cover" loading="lazy" />
          </button>
        ))}
        {canAdd ? (
          <PhotoPicker accept="image/jpeg,image/png,image/webp,image/heic" onFile={(f) => void onFile(f)}>
            <button
              type="button"
              disabled={uploading}
              aria-label={t("add")}
              data-tour="evidence.add"
              className="flex size-20 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
            >
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus className="size-6" />}
            </button>
          </PhotoPicker>
        ) : null}
      </div>
      {hiddenCount > 0 ? (
        <p className="pt-2 text-xs text-muted-foreground">{t("hidden", { count: hiddenCount })}</p>
      ) : null}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg p-2">
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          {open ? (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${open.fileId}`}
                alt=""
                className="max-h-[75dvh] w-full rounded-md object-contain"
              />
              {open.mine ? (
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-neg"
                  onClick={() => run(() => detach({ attachmentId: open.id }), { onSuccess: () => setOpen(null) })}
                >
                  <X className="size-4" /> {t("remove")}
                </button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function EvidenceSkeleton() {
  const t = useTranslations("evidence");
  return (
    <section className="px-5 pt-6" aria-busy>
      <h2 className="pb-2 text-base font-bold">{t("title")}</h2>
      <div className="flex flex-wrap gap-2">
        <div className="flex size-20 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImagePlus className="size-6" />
        </div>
      </div>
    </section>
  );
}
