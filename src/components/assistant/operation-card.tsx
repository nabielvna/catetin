"use client";

import { Check, Copy, Download, ExternalLink, Loader2, Share2, TriangleAlert, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { undoAssistantAction } from "@/actions/assistant";
import { ReviewActions, Shell, useSave } from "@/components/assistant/draft-cards/parts";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { switchLocale } from "@/i18n/switch-locale";
import { cn } from "@/lib/utils";

type Preview = { title: string; lines: string[]; danger?: string; confirm: string; review?: string };
type OpOutput =
  | {
      ok: true;
      summary: string;
      href?: string;
      undo?: { tool: string; input: Record<string, unknown> };
      link?: string;
      status?: string;
      locale?: "id" | "en";
      reviewed?: boolean;
    }
  | { ok: false; code: string; message: string };

export type OpPart = {
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean; requestReason?: string; reason?: string };
};

function parsePreview(raw: string | undefined): Preview | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Preview;
    return Array.isArray(p.lines) && typeof p.title === "string" ? p : null;
  } catch {
    return null;
  }
}

export function OpCard({
  part,
  live,
  onRespond,
  onReview,
}: {
  part: OpPart;

  live: boolean;
  onRespond: (approvalId: string, approved: boolean) => void;
  onReview: (href: string) => void;
}) {
  const t = useTranslations("assistant");
  const td = useTranslations("assistant.draft");
  const preview = parsePreview(part.approval?.requestReason);
  const [clicked, setClicked] = useState(false);

  const [fresh] = useState(part.state !== "output-available");

  if (part.approval?.isAutomatic && part.state !== "output-available") return null;
  if (part.state === "input-streaming" || part.state === "input-available") {
    return <Running label="…" />;
  }
  if (!preview) {
    if (part.state === "output-available")
      return <Result output={part.output as OpOutput} title="" lines={[]} fresh={fresh} />;
    return null;
  }

  if (part.state === "approval-requested" && preview.review) {
    const href = preview.review;
    return (
      <Shell title={preview.title} done={!live}>
        <Lines lines={preview.lines} />
        <ReviewActions
          live={live}
          onCancel={() => onRespond(part.approval!.id, false)}
          onReview={() => onReview(href)}
        />
      </Shell>
    );
  }
  if (part.state === "approval-requested" && !live) {
    return (
      <Shell title={preview.title} done>
        <Lines lines={preview.lines} />
        <span className="text-sm text-muted-foreground">{td("expired")}</span>
      </Shell>
    );
  }
  if (part.state === "approval-requested") {
    const danger = Boolean(preview.danger);
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-3.5",
          danger ? "border-neg bg-neg/5" : "border-foreground",
        )}
      >
        <span
          className={cn(
            "text-xs font-semibold tracking-[0.06em] uppercase",
            danger ? "text-neg" : "text-muted-foreground",
          )}
        >
          {preview.title}
        </span>
        <Lines lines={preview.lines} />
        {preview.danger ? (
          <p className="flex gap-2 text-[13px] leading-snug text-neg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{preview.danger}</span>
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={clicked}
            onClick={() => {
              setClicked(true);
              onRespond(part.approval!.id, false);
            }}
          >
            {td("cancel")}
          </Button>
          <Button
            size="sm"
            className={cn("ml-auto", danger && "bg-neg text-white hover:bg-neg/90")}
            disabled={clicked}
            onClick={() => {
              setClicked(true);
              onRespond(part.approval!.id, true);
            }}
          >
            {clicked ? <Loader2 className="animate-spin" /> : null}
            {preview.confirm}
          </Button>
        </div>
      </div>
    );
  }
  if (part.state === "approval-responded") {
    return part.approval?.approved ? (
      <Running label={t(preview.review ? "saving" : "running")} />
    ) : (
      <Cancelled title={preview.title} />
    );
  }
  if (part.state === "output-denied") return <Cancelled title={preview.title} />;
  if (part.state === "output-error") {
    return (
      <Shell title={preview.title} done>
        <span className="text-sm text-neg">{t("error")}</span>
      </Shell>
    );
  }
  return <Result output={part.output as OpOutput} title={preview.title} lines={preview.lines} fresh={fresh} />;
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((l, i) => (
        <span key={i} className={cn("text-sm", i === 0 ? "text-[15px] font-semibold" : "text-muted-foreground")}>
          {l}
        </span>
      ))}
    </div>
  );
}

function Running({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 self-start text-[13px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {label}
    </span>
  );
}

function Cancelled({ title }: { title: string }) {
  const td = useTranslations("assistant.draft");
  return (
    <Shell title={title} done>
      <span className="text-sm text-muted-foreground">{td("cancelled")}</span>
    </Shell>
  );
}

function Result({
  output,
  title,
  lines,
  fresh,
}: {
  output: OpOutput | undefined;
  title: string;
  lines: string[];
  fresh: boolean;
}) {
  const t = useTranslations("assistant");
  const td = useTranslations("assistant.draft");
  const pathname = usePathname();
  const { pending, run } = useSave();
  const [undone, setUndone] = useState(false);
  const [copied, setCopied] = useState(false);

  const locale = output?.ok ? output.locale : undefined;
  useEffect(() => {
    if (!locale || !fresh) return;
    switchLocale(locale, pathname);
  }, [locale, fresh, pathname]);

  if (!output) return <Running label={t("running")} />;
  if (!output.ok) {
    return (
      <Shell title={title} done>
        <span className="text-sm text-neg">{output.message}</span>
      </Shell>
    );
  }
  return (
    <Shell title={title} done>
      {lines[0] ? <span className="text-[15px] font-semibold">{lines[0]}</span> : null}
      {output.link ? (
        <div className="flex flex-col gap-2">
          <span className="truncate rounded-md bg-background px-2.5 py-2 text-[13px] num">{output.link}</span>
          <div className="flex gap-2">
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button size="xs" onClick={() => navigator.share({ text: output.link }).catch(() => {})}>
                <Share2 className="size-3.5" /> {t("share")}
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(output.link!);
                setCopied(true);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{" "}
              {copied ? t("copied") : t("copyLink")}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Check className="size-4 text-pos" />
          {undone ? td("undone") : output.summary}
        </span>
        {!undone && output.href ? (
          <Button asChild size="xs" variant="outline" className="ml-auto">
            <Link href={output.href}>
              <ExternalLink className="size-3.5" /> {td("view")}
            </Link>
          </Button>
        ) : null}
        {!undone && output.undo ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={async () => {
              if (await run(() => undoAssistantAction(output.undo!))) setUndone(true);
            }}
          >
            <Undo2 className="size-3.5" /> {td("undo")}
          </Button>
        ) : null}
      </div>
    </Shell>
  );
}

export type DownloadInput = { kind: "PERSON_PDF" | "PERSON_CSV" | "ALL_DATA"; partyId?: string };

export function DownloadCard({ input, name }: { input: DownloadInput; name?: string }) {
  const t = useTranslations("assistant.download");
  const href =
    input.kind === "ALL_DATA"
      ? "/api/export/me"
      : input.partyId
        ? `/api/export/person/${input.partyId}${input.kind === "PERSON_PDF" ? "/pdf" : ""}`
        : null;
  if (!href) return null;
  return (
    <Shell title={t("title")} done>
      <span className="text-[15px] font-semibold">
        {t(input.kind)}
        {name ? ` · ${name}` : ""}
      </span>
      <Button asChild size="sm" variant="outline" className="self-start">
        {}
        <a href={href} download>
          <Download className="size-4" /> {t("button")}
        </a>
      </Button>
    </Shell>
  );
}
