"use client";

import { Check, Search, Square, Volume2, X } from "lucide-react";

import { learnAlias } from "@/actions/assistant";
import { BillDraftCard } from "@/components/assistant/draft-cards/bill-card";
import { DebtDraftCard } from "@/components/assistant/draft-cards/debt-card";
import { PaymentDraftCard } from "@/components/assistant/draft-cards/payment-card";
import { DownloadCard, type DownloadInput, OpCard, type OpPart } from "@/components/assistant/operation-card";
import { openReview } from "@/components/assistant/review";
import { speak, stopSpeaking } from "@/components/assistant/speech";
import { type AssistantController, textOf } from "@/components/assistant/use-assistant";
import { TourCard, type TourInput } from "@/components/tour/tour-card";
import { Link } from "@/i18n/navigation";
import { detectLang } from "@/lib/detect-language";
import { cn } from "@/lib/utils";
import { type BillInput, type DebtInput, type PaymentInput } from "@/services/assistant/types";
export function MessageList({ controller }: { controller: AssistantController }) {
  const {
    t,
    te,
    router,
    quota,
    notice,
    format,
    locked,
    scroller,
    messages,
    addToolOutput,
    addToolApprovalResponse,
    status,
    error,
    chatPhoto,
    chatLang,
    speaking,
    voiceOk,
    busy,
    send,
    lastFindQuery,
    data,
  } = controller;
  return (
    <div ref={scroller} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4">
      {!data.enabled ? <p className="text-sm text-neg">{t("disabled")}</p> : null}
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end gap-4">
          <p className="text-[22px] leading-tight font-bold tracking-[-0.02em] text-balance">{t("greeting")}</p>
          <div className="flex flex-col items-start gap-2">
            {(t.raw("suggestions") as string[]).map((s) => (
              <button
                key={s}
                type="button"
                disabled={locked}
                onClick={() => send(s)}
                className="rounded-full border border-border px-3.5 py-2 text-left text-[13px] hover:bg-soft disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.rich("privacyNote", {
              link: (c) => (
                <Link href="/privacy" className="underline">
                  {c}
                </Link>
              ),
            })}
          </p>
        </div>
      ) : null}
      {messages.map((m) => (
        <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-stretch")}>
          {m.role === "assistant" && voiceOk && textOf(m) && !(busy && m.id === messages.at(-1)?.id) ? (
            <button
              type="button"
              className="order-last flex size-8 items-center justify-center self-start rounded-full text-muted-foreground hover:bg-soft hover:text-foreground"
              aria-label={speaking === m.id ? t("stopSpeaking") : t("speak")}
              onClick={() =>
                speaking === m.id ? stopSpeaking() : speak(m.id, textOf(m), detectLang(textOf(m)) ?? chatLang)
              }
            >
              {speaking === m.id ? <Square className="size-3.5" fill="currentColor" /> : <Volume2 className="size-4" />}
            </button>
          ) : null}
          {m.parts.map((part, i) => {
            if (part.type === "text") {
              if (!part.text) return null;
              return (
                <p
                  key={i}
                  className={cn(
                    "text-[15px] leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "max-w-[85%] rounded-[20px] bg-soft px-4 py-2.5" : "self-start",
                  )}
                >
                  {part.text}
                </p>
              );
            }
            if (part.type === "file") {
              return part.mediaType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={part.url} alt="" className="max-h-40 rounded-2xl" />
              ) : null;
            }
            if (!part.type.startsWith("tool-")) return null;
            const tool = part.type.slice(5);
            const p = part as unknown as { toolCallId: string; state: string; input?: unknown; output?: unknown };
            const submit = (output: unknown) =>
              void addToolOutput({ tool: tool as never, toolCallId: p.toolCallId, output: output as never });

            const live = m.id === messages.at(-1)?.id;
            const review = (href: string) => openReview(p.toolCallId, href, router.push);
            if (p.state === "input-streaming") return <Step key={i} label="…" busy />;

            if (p.state === "output-error" || (p.input === undefined && tool.startsWith("draft")))
              return <Step key={i} label={t("steps.failed")} failed />;
            switch (tool) {
              case "findPerson": {
                const q = (p.input as { name?: string })?.name ?? "";
                const out = p.output as { matches?: Array<{ name: string }> } | undefined;
                return (
                  <Step
                    key={i}
                    busy={p.state !== "output-available"}
                    label={
                      p.state !== "output-available"
                        ? t("steps.findPerson", { q })
                        : out?.matches?.length
                          ? t("steps.findPersonDone", {
                              names: out.matches
                                .slice(0, 3)
                                .map((x) => x.name)
                                .join(", "),
                            })
                          : t("steps.findPersonNone", { q })
                    }
                  />
                );
              }
              case "getBalances":
              case "listDebts":
              case "getStats":
              case "listGroups":
              case "getDetail":
              case "getInbox":
              case "search":
                return (
                  <Step
                    key={i}
                    busy={p.state !== "output-available"}
                    label={t(`steps.${tool}` as "steps.search", { q: (p.input as { query?: string })?.query ?? "" })}
                  />
                );
              case "rescanPhoto":
                return (
                  <Step
                    key={i}
                    busy={p.state !== "output-available"}
                    label={t("steps.rescanPhoto", { n: (p.input as { photo?: number })?.photo ?? "" })}
                  />
                );
              case "draftDebt":
                return (
                  <DebtDraftCard
                    key={i}
                    input={p.input as DebtInput}
                    output={p.output as never}
                    dir={data}
                    photo={chatPhoto}
                    live={live}
                    onCancel={() => submit({ status: "cancelled" })}
                    onReview={review}
                  />
                );
              case "draftPayment":
                return (
                  <PaymentDraftCard
                    key={i}
                    input={p.input as PaymentInput}
                    output={p.output as never}
                    dir={data}
                    photo={chatPhoto}
                    live={live}
                    onCancel={() => submit({ status: "cancelled" })}
                    onReview={review}
                  />
                );
              case "draftBill":
                return (
                  <BillDraftCard
                    key={i}
                    input={p.input as BillInput}
                    output={p.output as never}
                    dir={data}
                    photo={chatPhoto}
                    live={live}
                    onCancel={() => submit({ status: "cancelled" })}
                    onReview={review}
                  />
                );
              case "askChoice": {
                const inp = p.input as { question: string; options: Array<{ label: string; value: string }> };
                const out = p.output as { value: string; label: string } | undefined;
                return (
                  <div key={i} className="flex flex-col gap-2">
                    <p className="self-start text-[15px] leading-relaxed">{inp.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {inp.options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          disabled={Boolean(out) || !live}
                          onClick={() => {
                            submit({ value: o.value, label: o.label });
                            const q = lastFindQuery();
                            if (q && /^[0-9a-f-]{36}$/.test(o.value)) void learnAlias({ partyId: o.value, alias: q });
                          }}
                          className={cn(
                            "rounded-full border px-3.5 py-2 text-sm font-semibold",
                            out?.value === o.value
                              ? "border-foreground bg-foreground text-background"
                              : "border-border hover:bg-soft disabled:opacity-50",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              case "manageDebt":
              case "managePayment":
              case "respondRequest":
              case "managePerson":
              case "manageGroup":
              case "updateSettings":
                return (
                  <OpCard
                    key={i}
                    part={part as unknown as OpPart}
                    live={live}
                    onRespond={(id, approved) => void addToolApprovalResponse({ id, approved })}
                    onReview={review}
                  />
                );
              case "offerDownload": {
                const inp = p.input as DownloadInput;
                const name = inp.partyId ? data.people.find((x) => x.id === inp.partyId)?.name : undefined;
                return <DownloadCard key={i} input={inp} name={name} />;
              }
              case "navigate":
                return <Step key={i} label={t("navigating", { path: (p.input as { path: string }).path })} />;
              case "showTour":
                return p.input ? <TourCard key={i} id={p.toolCallId} input={p.input as TourInput} dir={data} /> : null;
              default:
                return null;
            }
          })}
        </div>
      ))}
      {status === "submitted" ? <Step label="…" busy /> : null}
      {locked && quota ? (
        <p className="text-sm text-neg">
          {t(quota.scope === "app" ? "quotaApp" : "quotaUser", {
            time: format.dateTime(new Date(quota.resetAt), { hour: "2-digit", minute: "2-digit" }),
          })}
        </p>
      ) : notice || error ? (
        <p className="text-sm text-neg">{notice ? t(notice) : te("INTERNAL")}</p>
      ) : null}
    </div>
  );
}
function Step({ label, busy, failed }: { label: string; busy?: boolean; failed?: boolean }) {
  return (
    <span className="flex items-center gap-2 self-start text-[13px] text-muted-foreground">
      {failed ? (
        <X className="size-3.5 text-neg" />
      ) : busy ? (
        <Search className="size-3.5 animate-pulse" />
      ) : (
        <Check className="size-3.5 text-pos" />
      )}
      {label}
    </span>
  );
}
