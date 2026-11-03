"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { attach } from "@/actions/files";
import { assistantStore } from "@/components/assistant/store";
import { Checkbox } from "@/components/ui/checkbox";
import { createStore } from "@/lib/store";

export type ReviewTool =
  | "draftDebt"
  | "draftPayment"
  | "draftBill"
  | "manageDebt"
  | "managePayment"
  | "managePerson"
  | "manageGroup"
  | "updateSettings";

export type ReviewEntry = {
  id: string;
  tool: ReviewTool;
  input: unknown;

  approvalId?: string;

  photo?: string;
};

type Target = { type: "OBLIGATION" | "SETTLEMENT" | "BILL"; id: string };

const PARAM = "review";

const SIGNAL_MS = 15_000;
const opened = createStore<{ id: string | null; at: number }>({ id: null, at: 0 });

export function openReview(id: string, href: string, push: (href: string) => void) {
  assistantStore.set({ open: false });
  opened.set({ id, at: Date.now() });
  push(`${href}${href.includes("?") ? "&" : "?"}${PARAM}=${encodeURIComponent(id)}`);
}

function currentId(signal: { id: string | null; at: number }) {
  if (signal.id && Date.now() - signal.at < SIGNAL_MS) return signal.id;
  return new URLSearchParams(window.location.search).get(PARAM);
}

export function useReview<T>({
  tools,
  match,
  apply,
  off = false,
}: {
  tools: ReviewTool[];
  match?: (input: T) => boolean;
  apply: (input: T, entry: ReviewEntry) => void;

  off?: boolean;
}) {
  const t = useTranslations("assistant");
  const [entry, setEntry] = useState<ReviewEntry | null>(null);
  const [attachPhoto, setAttachPhoto] = useState(true);
  const applied = useRef<string | null>(null);
  const latest = useRef({ tools, match, apply });
  useEffect(() => {
    latest.current = { tools, match, apply };
  });

  const signal = opened.useStore((s) => s);
  useEffect(() => {
    if (off) return;
    const id = currentId(signal);
    if (!id || applied.current === id) return;
    let alive = true;
    void (async () => {
      const s = await import("@/components/assistant/session");
      await s.loadSession();
      const e = s.pendingReview(id);
      const { tools, match, apply } = latest.current;
      if (!alive || !e || !tools.includes(e.tool) || (match && !match(e.input as T))) return;
      applied.current = id;
      opened.set({ id: null, at: 0 });
      apply(e.input as T, e);
      setAttachPhoto(true);
      setEntry(e);
    })();
    return () => {
      alive = false;
    };
  }, [signal, off]);

  const finish = useCallback(
    async (output?: unknown, photoTarget?: Target) => {
      if (!entry) return;

      setEntry(null);
      if (photoTarget && entry.photo && attachPhoto) {
        void attachDataUrl(entry.photo, photoTarget).then((ok) => {
          if (!ok) toast.error(t("photoAttachFailed"));
        });
      }
      const s = await import("@/components/assistant/session");
      s.completeReview(entry, output);
    },
    [entry, attachPhoto, t],
  );

  return { entry, attachPhoto, setAttachPhoto, finish };
}

export type ReviewHook = ReturnType<typeof useReview>;

export function ReviewBanner({ review, className }: { review: ReviewHook; className?: string }) {
  const t = useTranslations("assistant.review");
  const { entry } = review;
  if (!entry) return null;
  return (
    <div className={className ?? "flex items-start gap-3 rounded-xl bg-soft p-3"} role="status">
      {entry.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.photo} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
      ) : (
        <Sparkles className="mt-0.5 size-4 shrink-0 text-ai" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          {entry.photo ? <Sparkles className="size-4 text-ai" /> : null}
          {t("title")}
        </p>
        <p className="text-[13px] leading-snug text-muted-foreground">{t("hint")}</p>
        {entry.photo ? (
          <label className="mt-1.5 flex items-center gap-2 text-[13px] font-medium">
            <Checkbox checked={review.attachPhoto} onCheckedChange={(v) => review.setAttachPhoto(v === true)} />
            {t("attachPhoto")}
          </label>
        ) : null}
      </div>
    </div>
  );
}

async function attachDataUrl(dataUrl: string, target: Target) {
  try {
    const [head, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
    const bytes = Uint8Array.from(atob(b64 ?? ""), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), "photo");
    const r = await fetch("/api/files", { method: "POST", body: form });
    if (!r.ok) return false;
    const { id } = (await r.json()) as { id: string };
    return (await attach({ fileId: id, target })).ok;
  } catch {
    return false;
  }
}
