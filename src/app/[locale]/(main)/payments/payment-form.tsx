"use client";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { pay, suggestRate } from "@/actions/payments";
import { AllocationFields } from "@/app/[locale]/(main)/payments/allocation-fields";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { Chips, Segmented } from "@/components/forms/chips";
import { CurrencyField } from "@/components/forms/currency-picker";
import { MoneyInput } from "@/components/forms/money-input";
import { useAction } from "@/components/forms/use-action";
import { ScanMark, ScanSection } from "@/components/scan/scan-section";
import { useScan } from "@/components/scan/use-scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type Allocation, planWithExcess } from "@/domain/allocation";
import type { LocalDate } from "@/domain/dates";
import { convert, type Currency, fromMajor, isValidRate, parseAmount, toInputString, toMajor } from "@/domain/money";
import { type Receipt, receiptAmount } from "@/domain/receipt";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate, money } from "@/lib/format";
import type { PaymentInput } from "@/services/assistant/types";
import type { PaymentContext } from "@/services/payments/queries";

type Method = "CASH" | "TRANSFER" | "EWALLET" | "OTHER";
type ScanField = "amount" | "currency" | "method" | "date" | "note";

export function PaymentForm({
  ctx,
  myPartyId,
  today,
  initialDir,
  focusObligation,
  defaultCurrency,
}: {
  ctx: PaymentContext;
  myPartyId: string;
  today: LocalDate;
  initialDir: "in" | "out" | null;
  focusObligation: string | null;
  defaultCurrency: Currency;
}) {
  const t = useTranslations("payment");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [id] = useState(() => uuidv7());
  const name = ctx.name.split(" ")[0] ?? ctx.name;

  const theyOweAny = ctx.obligations.some((o) => o.direction === "THEY_OWE");
  const [dir, setDir] = useState<"in" | "out">(initialDir ?? (theyOweAny ? "in" : "out"));
  const direction = dir === "in" ? "THEY_OWE" : "I_OWE";
  const relevant = ctx.obligations.filter((o) => o.direction === direction);
  const currencies = [...new Set(relevant.map((o) => o.currency))];
  const focus = relevant.find((o) => o.id === focusObligation);
  const [target, setTarget] = useState<Currency>(
    focus?.currency ?? (currencies.includes(defaultCurrency) ? defaultCurrency : (currencies[0] ?? defaultCurrency)),
  );
  const open = relevant.filter((o) => o.currency === target);
  const total = open.reduce((s, o) => s + o.available, 0);

  const [cross, setCross] = useState(false);
  const [payCurrency, setPayCurrency] = useState<Currency>(target === "IDR" ? "USD" : "IDR");
  const [rate, setRate] = useState("");
  const [amountRaw, setAmountRaw] = useState(focus ? toInputString(focus.available, focus.currency) : "");
  const [amount, setAmount] = useState<number | null>(focus ? focus.available : null);
  const [method, setMethod] = useState<Method>("TRANSFER");
  const [date, setDate] = useState<LocalDate>(today);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState<Record<string, string>>(
    focus ? { [focus.id]: toInputString(focus.available, focus.currency) } : {},
  );
  const [mode, setMode] = useState<"auto" | "manual">(focus ? "manual" : "auto");
  const { pending, run } = useAction();

  const currency = cross ? payCurrency : target;

  useEffect(() => {
    if (!cross) return;
    let alive = true;
    void suggestRate({ from: payCurrency, to: target }).then((r) => {
      if (alive && r.ok && r.data.rate) setRate(r.data.rate);
    });
    return () => {
      alive = false;
    };
  }, [cross, payCurrency, target]);
  const targetAmount = useMemo(() => {
    if (amount === null) return null;
    if (!cross) return amount;
    if (!isValidRate(rate)) return null;
    try {
      return convert(amount, payCurrency, target, rate);
    } catch {
      return null;
    }
  }, [amount, cross, rate, payCurrency, target]);

  const plan: { allocations: Allocation[]; excess: number; error: string | null } = useMemo(() => {
    if (targetAmount === null || targetAmount <= 0) return { allocations: [], excess: 0, error: null };
    if (mode === "manual") {
      const allocations = Object.entries(manual)
        .map(([obligationId, v]) => ({ obligationId, amount: parseAmount(v, target) ?? 0 }))
        .filter((a) => a.amount > 0);
      const sum = allocations.reduce((s, a) => s + a.amount, 0);
      const over = allocations.find((a) => a.amount > (open.find((o) => o.id === a.obligationId)?.available ?? 0));
      return {
        allocations,
        excess: sum > 0 && sum < targetAmount ? targetAmount - sum : 0,
        error: over
          ? t("overpay", {
              amount: money(open.find((o) => o.id === over.obligationId)?.available ?? 0, target, locale),
            })
          : sum === 0 || sum > targetAmount
            ? t("allocMismatch", { sum: money(sum, target, locale), amount: money(targetAmount, target, locale) })
            : null,
      };
    }
    try {
      return { ...planWithExcess(open, targetAmount), error: null };
    } catch {
      return { allocations: [], excess: 0, error: t("overpay", { amount: money(total, target, locale) }) };
    }
  }, [targetAmount, mode, manual, open, t, target, locale, total]);

  const scan = useScan<ScanField>();

  const review = useReview<PaymentInput>({
    tools: ["draftPayment"],
    match: (d) => d.partyId === ctx.partyId,
    apply: (d) => {
      const nextDir = d.direction === "IN" ? "in" : "out";
      const payCur = d.currency ?? defaultCurrency;
      const debtCur = d.debtCurrency && d.debtCurrency !== payCur ? d.debtCurrency : null;
      const tgt = debtCur ?? payCur;
      const pool = ctx.obligations.filter(
        (o) =>
          o.direction === (nextDir === "in" ? "THEY_OWE" : "I_OWE") &&
          o.currency === tgt &&
          (!d.groupId || o.groupId === d.groupId),
      );
      const amt =
        d.amount !== undefined
          ? fromMajor(d.amount, payCur)
          : debtCur
            ? null
            : pool.reduce((s, o) => s + o.available, 0);
      setDir(nextDir);
      setTarget(tgt);
      setCross(debtCur !== null);
      if (debtCur) setPayCurrency(payCur);
      setAmountRaw(amt ? toInputString(amt, payCur) : "");
      setAmount(amt || null);
      if (d.groupId && amt && !debtCur) {
        let left = amt;
        const alloc: Record<string, string> = {};
        for (const o of pool) {
          if (left <= 0) break;
          const x = Math.min(left, o.available);
          alloc[o.id] = toInputString(x, tgt);
          left -= x;
        }
        setManual(alloc);
        setMode("manual");
      } else {
        setManual({});
        setMode("auto");
      }
      setMethod(d.method ?? "TRANSFER");
      if (d.paidOn) setDate(d.paidOn);
      setNote(d.note ?? "");
    },
  });

  function fillFromReceipt(r: Receipt): ScanField[] {
    const filled: ScanField[] = [];
    const amt = receiptAmount(r);
    if (r.currency !== currency) {
      filled.push("currency");
      if (currencies.includes(r.currency)) {
        setTarget(r.currency);
        setCross(false);
      } else {
        setCross(true);
        setPayCurrency(r.currency);
      }
    }
    if (amt) {
      setAmountRaw(toInputString(amt, r.currency));
      setAmount(amt);
      filled.push("amount");
    }
    if (r.method) {
      setMethod(r.method === "CARD" ? "OTHER" : r.method);
      filled.push("method");
    }
    if (r.date) {
      setDate(r.date);
      filled.push("date");
    }
    if (r.note) {
      setNote(r.note);
      filled.push("note");
    }
    return filled;
  }

  const valid =
    amount !== null && targetAmount !== null && targetAmount > 0 && !plan.error && plan.allocations.length > 0;

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    run(
      () =>
        pay({
          id,
          pairId: ctx.pairId,
          payerId: dir === "in" ? ctx.partyId : myPartyId,
          amount: amount!,
          currency,
          method,
          paidOn: date,
          note: note.trim() || null,
          counterCurrency: cross ? target : null,
          rate: cross ? rate : null,
          allocations: mode === "manual" ? plan.allocations : null,
          allowExcess: plan.excess > 0,
        }),
      {
        success: (d) => (d.status === "PENDING" ? t("savedPending", { name }) : t("saved")),
        onSuccess: (d) => {
          void scan.attachTo({ type: "SETTLEMENT", id: d.id });
          void review.finish(
            {
              status: "saved",
              id: d.id,
              pending: d.status === "PENDING",
              amount: toMajor(amount!, currency),
              currency,
            },
            { type: "SETTLEMENT", id: d.id },
          );
          router.replace(`/people/${ctx.partyId}`);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 px-5 pt-2 pb-10">
      <Segmented
        ariaLabel={t("who")}
        value={dir}
        onChange={(v) => {
          setDir(v);
          setManual({});
          setMode("auto");
        }}
        options={[
          { value: "in", label: t("receiveTitle", { name }) },
          { value: "out", label: t("payTitle", { name }) },
        ]}
      />

      <RecentPayments recent={ctx.recent.filter((r) => r.direction === dir)} name={name} />

      {relevant.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("overpay", { amount: money(0, target, locale) })}</p>
      ) : (
        <>
          <ReviewBanner review={review} />
          <ScanSection scan={scan} purpose="payment" currency={currency} onResult={fillFromReceipt} />

          {currencies.length > 1 ? (
            <Chips
              ariaLabel="currency"
              value={target}
              onChange={(c) => setTarget(c)}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <MoneyInput
              label={
                <>
                  {t("amount")} <ScanMark show={scan.marked.has("amount")} />
                </>
              }
              value={amountRaw}
              currency={currency}
              invalidHint={te("INVALID_INPUT")}
              onChange={(raw, parsed) => {
                setAmountRaw(raw);
                setAmount(parsed);
                scan.unmark("amount");
              }}
            />
            {!cross && total > 0 ? (
              <button
                type="button"
                className="self-start rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-soft"
                onClick={() => {
                  setAmountRaw(toInputString(total, target));
                  setAmount(total);
                }}
              >
                {t("payAll", { amount: money(total, target, locale) })}
              </button>
            ) : null}
          </div>

          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              {t("crossCurrency")} <ScanMark show={scan.marked.has("currency")} />
            </span>
            <Switch checked={cross} onCheckedChange={setCross} />
          </label>
          {cross ? (
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <CurrencyField
                value={payCurrency}
                onChange={setPayCurrency}
                base={target}
                exclude={[target]}
                title={t("payCurrency")}
                aria-label={t("payCurrency")}
              />
              <div className="flex flex-col gap-1">
                <Input
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(",", "."))}
                  placeholder={t("rate")}
                  aria-label={t("rate")}
                />
                <span className="text-xs text-muted-foreground">
                  {t("rateHint", { from: payCurrency, to: target })}
                </span>
              </div>
              {targetAmount !== null ? (
                <span className="col-span-2 text-sm font-semibold">
                  {t("converted", { amount: money(targetAmount, target, locale) })}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              {t("method")} <ScanMark show={scan.marked.has("method")} />
            </span>
            <Chips
              ariaLabel={t("method")}
              value={method}
              onChange={(m) => {
                setMethod(m);
                scan.unmark("method");
              }}
              options={(["TRANSFER", "CASH", "EWALLET", "OTHER"] as const).map((m) => ({
                value: m,
                label: t(`methods.${m}`),
              }))}
            />
          </div>

          <AllocationFields
            open={open}
            plan={plan}
            mode={mode}
            setMode={setMode}
            manual={manual}
            setManual={setManual}
            dir={dir}
            target={target}
            name={name}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">
                {t("date")} <ScanMark show={scan.marked.has("date")} />
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  setDate(e.target.value);
                  scan.unmark("date");
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">
              {t("note")} <span className="font-normal">({tc("optional")})</span>
              <ScanMark show={scan.marked.has("note")} />
            </Label>
            <Textarea
              id="note"
              value={note}
              maxLength={1000}
              onChange={(e) => {
                setNote(e.target.value);
                scan.unmark("note");
              }}
            />
          </div>

          <Button type="submit" size="lg" disabled={!valid || pending} data-tour="payment.submit">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {tc("save")}
          </Button>
        </>
      )}
    </form>
  );
}

function RecentPayments({ recent, name }: { recent: PaymentContext["recent"]; name: string }) {
  const t = useTranslations("payment");
  const locale = useLocale();
  if (recent.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-soft p-3" role="status">
      <p className="text-[15px] font-semibold">{t("recentTitle", { name })}</p>
      <p className="text-[13px] leading-snug text-muted-foreground">{t("recentHint")}</p>
      <ul className="mt-1 flex flex-col">
        {recent.map((r) => (
          <li key={r.id}>
            <Link href={`/payments/${r.id}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="font-semibold tabular-nums">
                {money(r.amount, r.currency, locale)}
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  {formatDate(r.paidOn, locale, { day: "numeric", month: "short" })}
                </span>
              </span>
              <span
                className={
                  r.status === "PENDING" && !r.byMe ? "text-[13px] font-semibold" : "text-[13px] text-muted-foreground"
                }
              >
                {r.status === "ACTIVE"
                  ? t("recentRecorded")
                  : r.byMe
                    ? t("recentAwaitingThem", { name })
                    : t("recentAwaitingYou")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
