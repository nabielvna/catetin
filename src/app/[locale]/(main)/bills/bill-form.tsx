"use client";
import { Loader2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { saveBill } from "@/actions/bills";
import { BillItemAssignments, BillItems, type Item } from "@/app/[locale]/(main)/bills/bill-items";
import { BillParticipants } from "@/app/[locale]/(main)/bills/bill-participants";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { AdjustmentFields } from "@/components/forms/adjustment-fields";
import { Chips, Segmented } from "@/components/forms/chips";
import { CurrencyField } from "@/components/forms/currency-picker";
import { type MemberSelection } from "@/components/forms/member-picker";
import { MoneyInput } from "@/components/forms/money-input";
import { PersonPicker, type PickedPerson } from "@/components/forms/person-picker";
import { useAction } from "@/components/forms/use-action";
import { ScanMark, ScanSection } from "@/components/scan/scan-section";
import { useScan } from "@/components/scan/use-scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { type Adjustments, adjustmentsToSplit, bpsToInput, breakdown, emptyAdjustments } from "@/domain/adjustments";
import { resolveBill } from "@/domain/assistant-drafts";
import type { LocalDate } from "@/domain/dates";
import { isDomainError } from "@/domain/errors";
import { type Currency, fromMajor, parseAmount, toInputString, toMajor } from "@/domain/money";
import { type Receipt, receiptAdjustments, receiptAmount, totalMismatch } from "@/domain/receipt";
import { computeSplit, type SplitInput, type SplitMode, type SplitResult } from "@/domain/split";
import { useRouter } from "@/i18n/navigation";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type BillInput } from "@/services/assistant/types";
import type { PickablePerson } from "@/services/people/queries";

type ScanField = "title" | "date" | "currency" | "items" | "subtotal" | "service" | "tax" | "discount";

function pctToBps(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

export function BillWizard({
  me,
  people,
  group,
  currency: initialCurrency,
  today,
  skeleton = false,
}: {
  me: { partyId: string; name: string };
  people: PickablePerson[];
  group: { id: string; name: string; currency: string; memberIds: string[] } | null;
  currency: Currency;
  today: LocalDate;

  skeleton?: boolean;
}) {
  const t = useTranslations("bill");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tg = useTranslations("groups");
  const ts = useTranslations("scan");
  const locale = useLocale();
  const router = useRouter();

  const newId = () => (skeleton ? "" : uuidv7());
  const [id] = useState(newId);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<LocalDate>(today);

  const [dueOn, setDueOn] = useState<LocalDate | null>(null);
  const [payerKind, setPayerKind] = useState<"me" | "other">("me");
  const [payer, setPayer] = useState<PickedPerson | null>(null);
  const [useItems, setUseItems] = useState(false);
  const [subtotalRaw, setSubtotalRaw] = useState("");
  const [items, setItems] = useState<Item[]>(() => [{ id: newId(), name: "", raw: "", assignees: [] }]);
  const [adj, setAdj] = useState<Adjustments>(emptyAdjustments);

  const [includeMe, setIncludeMe] = useState(true);
  const [sel, setSel] = useState<MemberSelection>({ ids: group?.memberIds ?? [], manual: [] });
  const [mode, setMode] = useState<SplitMode>("EQUAL");
  const [exact, setExact] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const scan = useScan<ScanField>();

  function fillFromReceipt(r: Receipt): ScanField[] {
    const filled: ScanField[] = [];
    const input = (m: number) => toInputString(m, r.currency);
    if (r.currency !== currency) filled.push("currency");
    setCurrency(r.currency);
    if (r.merchant) {
      setTitle(r.merchant);
      filled.push("title");
    }
    if (r.date) {
      setDate(r.date);
      filled.push("date");
    }

    const detailed = r.items.length > 0 || r.subtotal !== null;
    if (r.items.length > 0) {
      setUseItems(true);
      setItems(
        r.items.map((it) => ({
          id: uuidv7(),
          name: it.name,
          raw: input(it.amount),
          assignees: [],
          suspect: it.suspect,
        })),
      );
      setMode("ITEMS");
      filled.push("items");
    } else {
      setUseItems(false);
      setSubtotalRaw(input((detailed ? r.subtotal : receiptAmount(r)) ?? 0));
      filled.push("subtotal");
    }
    const a = detailed ? receiptAdjustments(r) : emptyAdjustments();
    setAdj(a);
    for (const key of ["service", "tax", "discount"] as const) if (a[key].raw) filled.push(key);
    return filled;
  }

  const [newPayerId] = useState(newId);

  const review = useReview<BillInput>({
    tools: ["draftBill"],
    off: skeleton,
    apply: (d) => {
      const payerName = d.payer !== "me" && !d.payer.partyId ? d.payer.newPersonName?.trim().toLowerCase() : null;
      const ids = new Map<string, string>();
      const r = resolveBill(
        d,
        {
          me: { partyId: me.partyId, name: me.name, currency: initialCurrency },
          people: people.map((p) => ({ id: p.partyId, name: p.name, state: "" })),
          groups: [],
        },
        (key) => {
          if (key === payerName) return newPayerId;
          if (!ids.has(key)) ids.set(key, uuidv7());
          return ids.get(key)!;
        },
      );
      const cur = r.currency;
      const input = (m: number) => toInputString(m, cur);
      const minor = (v: number) => fromMajor(v, cur);
      setCurrency(cur);
      setTitle(d.title);
      if (d.occurredOn) setDate(d.occurredOn);
      setDueOn(d.dueOn ?? null);
      const who = d.payer;
      if (who === "me") setPayerKind("me");
      else {
        setPayerKind("other");
        const known = who.partyId ? people.find((p) => p.partyId === who.partyId) : undefined;
        if (known) setPayer({ kind: "existing", partyId: known.partyId, name: known.name });
        else if (who.newPersonName) setPayer({ kind: "new", name: who.newPersonName.trim() });
      }
      setIncludeMe(r.participants.includes(me.partyId));
      const fresh = new Set(r.newPeople.map((p) => p.id));
      setSel({
        ids: r.participants.filter((p) => p !== me.partyId && !fresh.has(p)),
        manual: r.newPeople.filter((p) => r.participants.includes(p.id)),
      });
      if (r.items.length) {
        setUseItems(true);
        setItems(
          r.items.map((it) => ({ id: uuidv7(), name: it.name, raw: input(it.amount), assignees: it.assignees })),
        );
      } else {
        setUseItems(false);
        const exactSum = r.exact ? Object.values(r.exact).reduce((a, b) => a + b, 0) : 0;
        setSubtotalRaw(input(d.subtotal ? minor(d.subtotal) : exactSum));
      }
      setMode(r.mode);
      if (r.exact) setExact(Object.fromEntries(Object.entries(r.exact).map(([k, v]) => [k, input(v)])));
      if (r.shares) setShares(Object.fromEntries(Object.entries(r.shares).map(([k, v]) => [k, String(v)])));
      const adjOf = (amount: number | undefined, bps: number | undefined) =>
        amount !== undefined
          ? { unit: "AMT" as const, raw: input(minor(amount)) }
          : { unit: "PCT" as const, raw: bpsToInput(bps ?? 0) };
      setAdj({
        discount: { unit: "AMT", raw: d.discount ? input(minor(d.discount)) : "" },
        service: adjOf(d.serviceAmount, d.serviceBps),
        tax: adjOf(d.taxAmount, d.taxBps),
      });
      setStep(1);
    },
  });
  const payerId =
    payerKind === "me"
      ? me.partyId
      : payer?.kind === "existing"
        ? payer.partyId
        : payer?.kind === "new"
          ? newPayerId
          : null;

  const names = useMemo(() => {
    const m = new Map<string, string>(people.map((p) => [p.partyId, p.name]));
    m.set(me.partyId, `${me.name} (${tg("you")})`);
    for (const x of sel.manual) m.set(x.id, x.name);
    if (payer?.kind === "new") m.set(newPayerId, payer.name);
    return m;
  }, [people, me, sel.manual, payer, newPayerId, tg]);

  const participants = useMemo(
    () => [
      ...(includeMe ? [me.partyId] : []),
      ...sel.ids.filter((x) => x !== me.partyId),
      ...sel.manual.map((m) => m.id),
    ],
    [includeMe, me.partyId, sel],
  );

  const parsedItems = useMemo(
    () => items.map((it) => ({ ...it, amount: parseAmount(it.raw, currency) })),
    [items, currency],
  );
  const itemsTotal = parsedItems.reduce((s, it) => s + (it.amount ?? 0), 0);
  const subtotal = useItems ? itemsTotal : (parseAmount(subtotalRaw, currency) ?? 0);
  const adjSplit = useMemo(() => adjustmentsToSplit(adj, currency), [adj, currency]);

  const splitInput: SplitInput = useMemo(() => {
    const toMap = (rec: Record<string, string>, f: (v: string) => number) =>
      Object.fromEntries(participants.map((p) => [p, f(rec[p] ?? "")]));
    return {
      participants,
      mode,
      items: useItems
        ? parsedItems
            .filter((it) => it.name.trim() && it.amount)
            .map((it) => ({
              id: it.id,
              name: it.name.trim(),
              amount: it.amount!,
              assignees: it.assignees.filter((a) => participants.includes(a)),
            }))
        : undefined,
      subtotal: useItems ? undefined : subtotal,
      exact: mode === "EXACT" ? toMap(exact, (v) => parseAmount(v, currency) ?? 0) : undefined,
      percent: mode === "PERCENT" ? toMap(percent, pctToBps) : undefined,
      shares: mode === "SHARES" ? toMap(shares, (v) => Math.max(0, Math.round(Number(v) || 0))) : undefined,
      ...adjSplit,
    };
  }, [participants, mode, useItems, parsedItems, subtotal, exact, percent, shares, adjSplit, currency]);

  const result: { ok: true; r: SplitResult } | { ok: false; reason: string } = useMemo(() => {
    try {
      return { ok: true, r: computeSplit(splitInput) };
    } catch (e) {
      return { ok: false, reason: isDomainError(e) ? String(e.params?.reason ?? e.code) : "?" };
    }
  }, [splitInput]);

  const billTotal = breakdown(subtotal, adj, currency)?.total ?? null;
  const mismatch = scan.receipt && billTotal !== null ? totalMismatch(billTotal, scan.receipt) : 0;

  const step1Valid =
    title.trim() &&
    subtotal > 0 &&
    adjSplit !== null &&
    payerId !== null &&
    (!useItems || parsedItems.every((it) => !it.raw || it.amount !== null));
  const step2Valid = participants.length > 0 && result.ok;

  function submit() {
    if (!result.ok || !payerId) return;
    run(
      () =>
        saveBill({
          id,
          title: title.trim(),
          occurredOn: date,
          dueOn,
          currency,
          category: "SHARED",
          groupId: group?.id ?? null,
          payerId,

          newPeople: [
            ...sel.manual.filter((m) => payer?.kind !== "new" || m.id !== newPayerId),
            ...(payer?.kind === "new" ? [{ id: newPayerId, name: payer.name }] : []),
          ],
          split: splitInput,
        }),
      {
        success: t("saved"),
        onSuccess: (d) => {
          void scan.attachTo({ type: "BILL", id: d.id });
          void review.finish(
            { status: "saved", id: d.id, title: title.trim(), total: toMajor(result.r.total, currency), currency },
            { type: "BILL", id: d.id },
          );
          router.replace(`/bills/${d.id}`);
        },
      },
    );
  }

  const stepper = (
    <ol className="flex gap-2 px-5 pb-4" aria-label={t("steps")}>
      {[t("step1"), t("step2"), t("step3")].map((label, i) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span className={cn("h-1 rounded-full", i + 1 <= step ? "bg-foreground" : "bg-soft")} />
          <span className={cn("text-xs font-semibold", i + 1 === step ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );

  if (step === 1) {
    return (
      <div className="pb-10" inert={skeleton} aria-busy={skeleton || undefined}>
        {stepper}
        <div className="flex flex-col gap-6 px-5">
          {group ? (
            <p className="text-[13px] text-muted-foreground">{skeleton ? <SkeletonText w="12ch" /> : group.name}</p>
          ) : null}
          <ReviewBanner review={review} />
          <ScanSection scan={scan} purpose="bill" currency={currency} onResult={fillFromReceipt} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="btitle">
              {t("title")} <ScanMark show={scan.marked.has("title")} />
            </Label>
            <Input
              id="btitle"
              value={title}
              maxLength={100}
              onChange={(e) => {
                setTitle(e.target.value);
                scan.unmark("title");
              }}
              placeholder={t("titlePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("payer")}</span>
            <Segmented
              ariaLabel={t("payer")}
              value={payerKind}
              onChange={setPayerKind}
              options={[
                { value: "me", label: t("payerMe") },
                { value: "other", label: t("payerOther") },
              ]}
            />
            {payerKind === "other" ? <PersonPicker people={people} value={payer} onChange={setPayer} /> : null}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            {t("useItems")}
            <Switch checked={useItems} onCheckedChange={setUseItems} />
          </label>
          {useItems ? (
            <BillItems
              items={items}
              marked={scan.marked.has("items")}
              onChange={(next) => {
                setItems(next);
                scan.unmark("items");
              }}
            />
          ) : (
            <MoneyInput
              label={
                <>
                  {t("subtotal")} <ScanMark show={scan.marked.has("subtotal")} />
                </>
              }
              value={subtotalRaw}
              currency={currency}
              skeleton={skeleton}
              invalidHint={te("INVALID_INPUT")}
              onChange={(r) => {
                setSubtotalRaw(r);
                scan.unmark("subtotal");
              }}
            />
          )}
          <AdjustmentFields
            value={adj}
            subtotal={subtotal}
            currency={currency}
            onChange={(next, key) => {
              setAdj(next);
              scan.unmark(key);
            }}
            label={(key, text) => (
              <>
                {text} <ScanMark show={scan.marked.has(key)} />
              </>
            )}
            footer={
              mismatch !== 0 && scan.receipt?.total ? (
                <p className="mt-1.5 flex gap-2 text-[13px] leading-snug text-neg" role="alert">
                  <TriangleAlert className="mt-px size-4 shrink-0" />
                  {ts("mismatch", {
                    diff: money(Math.abs(mismatch), currency, locale),
                    dir: mismatch > 0 ? "over" : "under",
                    total: money(scan.receipt.total, currency, locale),
                  })}
                </p>
              ) : null
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bdate">
                {t("date")} <ScanMark show={scan.marked.has("date")} />
              </Label>
              <Input
                id="bdate"
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  setDate(e.target.value);
                  scan.unmark("date");
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bcurrency">
                {t("currency")} <ScanMark show={scan.marked.has("currency")} />
              </Label>
              <CurrencyField
                id="bcurrency"
                value={currency}
                onChange={(c) => {
                  setCurrency(c);
                  scan.unmark("currency");
                }}
                base={initialCurrency}
                title={t("currency")}
              />
            </div>
            {dueOn !== null ? (
              <div className="col-span-2 flex flex-col gap-2">
                <Label htmlFor="bdue">{t("due")}</Label>
                <Input
                  id="bdue"
                  type="date"
                  value={dueOn}
                  min={date}
                  onChange={(e) => setDueOn(e.target.value || null)}
                />
              </div>
            ) : null}
          </div>
          <Button size="lg" disabled={!step1Valid} data-tour="bill.next1" onClick={() => setStep(2)}>
            {tc("next")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    const inputFor = (p: string) => {
      if (mode === "EXACT")
        return (
          <Input
            className="h-10 w-32 text-right"
            inputMode="decimal"
            value={exact[p] ?? ""}
            placeholder="0"
            onChange={(e) => setExact({ ...exact, [p]: e.target.value })}
            aria-label={names.get(p)}
          />
        );
      if (mode === "PERCENT")
        return (
          <Input
            className="h-10 w-24 text-right"
            inputMode="decimal"
            value={percent[p] ?? ""}
            placeholder="%"
            onChange={(e) => setPercent({ ...percent, [p]: e.target.value })}
            aria-label={names.get(p)}
          />
        );
      if (mode === "SHARES")
        return (
          <Input
            className="h-10 w-20 text-right"
            inputMode="numeric"
            value={shares[p] ?? "1"}
            onChange={(e) => setShares({ ...shares, [p]: e.target.value })}
            aria-label={names.get(p)}
          />
        );
      return null;
    };
    const unassigned =
      mode === "ITEMS"
        ? parsedItems.filter(
            (it) => it.name.trim() && it.amount && it.assignees.filter((a) => participants.includes(a)).length === 0,
          ).length
        : 0;
    return (
      <div className="pb-10">
        {stepper}
        <div className="flex flex-col gap-6 px-5">
          <BillParticipants
            includeMe={includeMe}
            setIncludeMe={setIncludeMe}
            people={people}
            sel={sel}
            setSel={setSel}
            myPartyId={me.partyId}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("mode")}</span>
            <Chips
              ariaLabel={t("mode")}
              value={mode}
              onChange={setMode}
              options={(
                ["EQUAL", ...(useItems ? (["ITEMS"] as const) : []), "EXACT", "PERCENT", "SHARES"] as SplitMode[]
              ).map((m) => ({ value: m, label: t(`modes.${m}`) }))}
            />
          </div>
          {mode === "ITEMS" ? (
            <BillItemAssignments
              items={items}
              parsedItems={parsedItems}
              participants={participants}
              names={names}
              currency={currency}
              setItems={setItems}
              unassigned={unassigned}
            />
          ) : mode !== "EQUAL" ? (
            <ul>
              {participants.map((p) => (
                <li
                  key={p}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <span className="truncate text-[15px] font-medium">{names.get(p)}</span>
                  {inputFor(p)}
                </li>
              ))}
            </ul>
          ) : null}
          {!result.ok && participants.length > 0 && mode !== "ITEMS" ? (
            <p className="text-sm text-neg">{te("SPLIT_INVALID")}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              {tc("back")}
            </Button>
            <Button className="flex-2" disabled={!step2Valid} data-tour="bill.next2" onClick={() => setStep(3)}>
              {tc("next")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const r = result.ok ? result.r : null;
  return (
    <div className="pb-10">
      {stepper}
      <div className="flex flex-col gap-5 px-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-[-0.02em]">{title}</h2>
          <span className="text-[13px] text-muted-foreground">
            {t("payer")}: {payerId ? names.get(payerId) : "?"}
          </span>
        </div>
        {r ? (
          <>
            <ul>
              {r.shares.map((s) => (
                <li key={s.partyId} className="flex items-center justify-between gap-3 border-b border-line py-3">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold">{names.get(s.partyId)}</span>
                    {s.service + s.tax - s.discount !== 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {money(s.base, currency, locale)} {s.discount ? `− ${money(s.discount, currency, locale)}` : ""}{" "}
                        {s.service ? `+ ${money(s.service, currency, locale)}` : ""}{" "}
                        {s.tax ? `+ ${money(s.tax, currency, locale)}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[15px] font-bold num">{money(s.total, currency, locale)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal")}</dt>
                <dd className="num">{money(r.subtotal, currency, locale)}</dd>
              </div>
              {r.discount ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("discount")}</dt>
                  <dd className="num">−{money(r.discount, currency, locale)}</dd>
                </div>
              ) : null}
              {r.service ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("service")}</dt>
                  <dd className="num">{money(r.service, currency, locale)}</dd>
                </div>
              ) : null}
              {r.tax ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("tax")}</dt>
                  <dd className="num">{money(r.tax, currency, locale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
                <dt>{t("total")}</dt>
                <dd className="num">{money(r.total, currency, locale)}</dd>
              </div>
            </dl>
          </>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
            {tc("back")}
          </Button>
          <Button className="flex-2" disabled={!r || pending} data-tour="bill.submit" onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BillWizardSkeleton({ inGroup = false }: { inGroup?: boolean }) {
  return (
    <BillWizard
      skeleton
      me={{ partyId: "", name: "" }}
      people={[]}
      group={inGroup ? { id: "", name: "", currency: "IDR", memberIds: [] } : null}
      currency="IDR"
      today="2000-01-01"
    />
  );
}
