"use client";

import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { guessDebtCategory, recordDebt } from "@/actions/debts";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { AdjustmentFields } from "@/components/forms/adjustment-fields";
import { Chips, Segmented } from "@/components/forms/chips";
import { CurrencyField } from "@/components/forms/currency-picker";
import { ItemList, type ItemRow, itemsValid, parseItems } from "@/components/forms/item-list";
import { LabelInput } from "@/components/forms/label-input";
import { MoneyInput } from "@/components/forms/money-input";
import { NativeSelect } from "@/components/forms/native-select";
import { PersonPicker, type PickedPerson } from "@/components/forms/person-picker";
import { useAction } from "@/components/forms/use-action";
import { ScanMark, ScanSection } from "@/components/scan/scan-section";
import { useScan } from "@/components/scan/use-scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type AdjKey, adjustmentLines, type Adjustments, breakdown, emptyAdjustments } from "@/domain/adjustments";
import { addDays, endOfMonth, type LocalDate } from "@/domain/dates";
import { CATEGORIES, type Category, suggestCategory } from "@/domain/debt";
import { addPeriods, INSTALLMENTS_MAX, INSTALLMENTS_MIN, scheduleOf } from "@/domain/installments";
import { type Currency, fromMajor, toInputString, toMajor } from "@/domain/money";
import { type Receipt, receiptAdjustments, receiptAmount, totalMismatch } from "@/domain/receipt";
import { useRouter } from "@/i18n/navigation";
import { formatDate, money } from "@/lib/format";
import type { DebtInput } from "@/services/assistant/types";
import type { PickablePerson } from "@/services/people/queries";

type Due = "none" | "week" | "month" | "pick";
type Plan = "once" | "installments" | "repeat";
type ScanField = "amount" | "title" | "date" | "currency" | "category" | "items" | AdjKey;

const newRow = (): ItemRow => ({ id: uuidv7(), name: "", raw: "" });

export function DebtForm(props: {
  people: PickablePerson[];
  groups: Array<{ id: string; name: string; mode: "CONFIRM" | "TRUST" }>;
  initialPartyId: string | null;
  initialGroupId: string | null;
  currency: Currency;
  today: LocalDate;

  skeleton?: boolean;
}) {
  const t = useTranslations("debt");
  const tc = useTranslations("common");
  const tcat = useTranslations("categories");
  const te = useTranslations("errors");
  const router = useRouter();

  const [id] = useState(() => (props.skeleton ? "" : uuidv7()));
  const [newPersonId] = useState(() => (props.skeleton ? "" : uuidv7()));
  const initial = props.people.find((p) => p.partyId === props.initialPartyId);
  const [person, setPerson] = useState<PickedPerson | null>(
    initial ? { kind: "existing", partyId: initial.partyId, name: initial.name } : null,
  );
  const [direction, setDirection] = useState<"THEY_OWE" | "I_OWE">("THEY_OWE");
  const [amountRaw, setAmountRaw] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency>(props.currency);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [more, setMore] = useState(false);
  const [date, setDate] = useState<LocalDate>(props.today);
  const [due, setDue] = useState<Due>("none");
  const [dueDate, setDueDate] = useState<LocalDate>(addDays(props.today, 7));
  const [note, setNote] = useState("");
  const [groupId, setGroupId] = useState<string | null>(props.initialGroupId);
  const [plan, setPlan] = useState<Plan>("once");
  const [instCount, setInstCount] = useState("3");
  const [instEvery, setInstEvery] = useState<"WEEK" | "MONTH">("MONTH");
  const [instFirst, setInstFirst] = useState<LocalDate>(addPeriods(props.today, "MONTH", 1));
  const [repeatEvery, setRepeatEvery] = useState<"WEEK" | "MONTH" | "YEAR">("MONTH");
  const [repeatDue, setRepeatDue] = useState<string>("none");
  const [labels, setLabels] = useState<string[]>([]);
  const [serverGuess, setServerGuess] = useState<{ title: string; category: Category | null; source: string | null }>();
  const { pending, run } = useAction();
  const tr = useTranslations("recurring");
  const locale = useLocale();
  const scan = useScan<ScanField>();
  const tadj = useTranslations("adjust");
  const tscan = useTranslations("scan");

  const [useItems, setUseItems] = useState(false);
  const [items, setItems] = useState<ItemRow[]>(() => [{ id: "", name: "", raw: "" }]);
  const [adj, setAdj] = useState<Adjustments>(emptyAdjustments);
  const itemsOn = useItems && plan !== "repeat";
  const parsedItems = parseItems(items, currency);
  const itemsSubtotal = parsedItems.reduce((s, it) => s + (it.amount ?? 0), 0);
  const itemsBreakdown = itemsOn ? breakdown(itemsSubtotal, adj, currency) : null;
  const finalAmount = itemsOn ? (itemsBreakdown?.total ?? null) : amount;

  const mismatch =
    itemsOn && itemsBreakdown && scan.receipt
      ? totalMismatch(itemsBreakdown.total - Math.max(0, scan.receipt.rounding), scan.receipt)
      : 0;

  function fillFromReceipt(r: Receipt) {
    const filled: ScanField[] = [];
    const amt = receiptAmount(r);
    if (r.currency !== currency) filled.push("currency");
    setCurrency(r.currency);
    if (r.items.length > 0) {
      const input = (m: number) => toInputString(m, r.currency);
      setItems([
        ...r.items.map((it) => ({ id: uuidv7(), name: it.name, raw: input(it.amount), suspect: it.suspect })),

        ...(r.rounding > 0 ? [{ id: uuidv7(), name: tadj("rounding"), raw: input(r.rounding) }] : []),
      ]);
      const a = receiptAdjustments(r);
      setAdj(a);
      setUseItems(true);
      filled.push("items");
      for (const key of ["service", "tax", "discount"] as const) if (a[key].raw) filled.push(key);
    } else if (amt) {
      setUseItems(false);
      setAmountRaw(toInputString(amt, r.currency));
      setAmount(amt);
      filled.push("amount");
    }
    if (r.merchant) {
      setTitle(r.merchant);
      filled.push("title");
    }
    if (r.date) {
      setDate(r.date);
      filled.push("date");
    }
    if (r.category) {
      setCategory(r.category);
      setCategoryTouched(true);
      filled.push("category");
    }
    if ((r.date && r.date !== props.today) || r.currency !== currency) setMore(true);
    return filled;
  }

  const review = useReview<DebtInput>({
    tools: ["draftDebt"],
    off: props.skeleton,
    apply: (d) => {
      const c = d.currency ?? props.currency;
      const minor = fromMajor(d.amount, c);
      const known = d.person.partyId ? props.people.find((p) => p.partyId === d.person.partyId) : undefined;
      setPerson(
        known
          ? { kind: "existing", partyId: known.partyId, name: known.name }
          : d.person.newPersonName
            ? { kind: "new", name: d.person.newPersonName }
            : null,
      );
      setDirection(d.direction);
      setCurrency(c);
      setUseItems(false);
      setAmountRaw(toInputString(minor, c));
      setAmount(minor);
      setTitle(d.title);
      if (d.category) {
        setCategory(d.category as Category);
        setCategoryTouched(true);
      }
      if (d.occurredOn) setDate(d.occurredOn);
      if (d.dueOn) {
        setDue("pick");
        setDueDate(d.dueOn);
      }
      if (d.groupId) setGroupId(d.groupId);
      setNote(d.note ?? "");
      setLabels(d.labels ?? []);
      if (d.installments) {
        setPlan("installments");
        setInstCount(String(d.installments.count));
        setInstEvery(d.installments.every);
        setInstFirst(d.installments.firstDue);
      } else if (d.repeat) {
        setPlan("repeat");
        setRepeatEvery(d.repeat.every);
        setRepeatDue(d.repeat.dueAfterDays ? String(d.repeat.dueAfterDays) : "none");
      }
      setMore(true);
    },
  });

  const name = person?.name.split(" ")[0] ?? t("theyOweGeneric").split(" ")[0]!;
  const personGroups = useMemo(() => {
    if (!person || person.kind === "new") return [];
    const p = props.people.find((x) => x.partyId === person.partyId);
    return props.groups.filter((g) => p?.groupIds.includes(g.id));
  }, [person, props.people, props.groups]);
  const effectiveGroup = personGroups.some((g) => g.id === groupId) ? groupId : null;

  const dueOn: LocalDate | null =
    due === "none" ? null : due === "week" ? addDays(date, 7) : due === "month" ? endOfMonth(date) : dueDate;

  useEffect(() => {
    const q = title.trim();
    if (categoryTouched || q.length < 3) return;
    const timer = setTimeout(async () => {
      const res = await guessDebtCategory({ title: q }).catch(() => null);
      if (res?.ok) setServerGuess({ title: q, ...res.data });
    }, 500);
    return () => clearTimeout(timer);
  }, [title, categoryTouched]);
  const fromServer = serverGuess && serverGuess.title === title.trim() ? serverGuess : null;
  const suggested = !categoryTouched ? (fromServer?.category ?? suggestCategory(title)) : null;
  const guessSource = fromServer?.category ? fromServer.source : null;

  const count = Number(instCount);
  const countValid = Number.isInteger(count) && count >= INSTALLMENTS_MIN && count <= INSTALLMENTS_MAX;
  const schedule =
    plan === "installments" && countValid && finalAmount && finalAmount >= count
      ? scheduleOf(finalAmount, { count, every: instEvery, firstDue: instFirst })
      : null;
  const effectiveCategory = categoryTouched ? category : suggested;
  const valid =
    person !== null &&
    finalAmount !== null &&
    finalAmount > 0 &&
    (!itemsOn || itemsValid(items, currency)) &&
    title.trim().length > 0 &&
    (plan !== "installments" || schedule !== null);

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || !person) return;
    run(
      () =>
        recordDebt({
          id,
          counterpartId: person.kind === "existing" ? person.partyId : null,
          newPerson: person.kind === "new" ? { id: newPersonId, name: person.name } : null,
          direction,
          amount: finalAmount!,
          currency,
          items:
            itemsOn && itemsBreakdown
              ? [
                  ...parsedItems
                    .filter((it) => it.name.trim() && it.amount)
                    .map((it) => ({ name: it.name.trim(), qtyMilli: 1000, unitPrice: it.amount! })),
                  ...adjustmentLines(itemsBreakdown, adj, {
                    discount: tadj("discount"),
                    service: tadj("service"),
                    tax: tadj("tax"),
                  }),
                ]
              : undefined,
          title: title.trim(),
          note: note.trim() || null,
          category: effectiveCategory,
          occurredOn: date,
          dueOn: plan === "once" ? dueOn : null,
          groupId: effectiveGroup,
          installments: plan === "installments" ? { count, every: instEvery, firstDue: instFirst } : null,
          repeat:
            plan === "repeat"
              ? { every: repeatEvery, dueAfterDays: repeatDue === "none" ? null : Number(repeatDue) }
              : null,
          labels: plan === "repeat" ? undefined : labels,
        }),
      {
        success: (d) =>
          d.recurring
            ? d.status === "PENDING"
              ? tr("savedPending", { name })
              : tr("saved")
            : d.status === "PENDING"
              ? t("savedPending", { name })
              : t("saved"),
        onSuccess: (d) => {
          if (!d.recurring) void scan.attachTo({ type: "OBLIGATION", id: d.id });
          void review.finish(
            {
              status: "saved",
              id: d.id,
              pending: d.status === "PENDING",
              recurring: d.recurring || undefined,
              partyId: d.counterpartId,
              title: title.trim(),
              amount: toMajor(finalAmount!, currency),
              currency,
            },
            d.recurring ? undefined : { type: "OBLIGATION", id: d.id },
          );
          router.replace(`/people/${d.counterpartId}`);
        },
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      inert={props.skeleton}
      aria-busy={props.skeleton || undefined}
      className="flex flex-col gap-6 px-5 pt-2 pb-10"
    >
      <ReviewBanner review={review} />
      <ScanSection scan={scan} purpose="debt" currency={currency} onResult={fillFromReceipt} />

      <PersonPicker
        people={props.people}
        value={props.skeleton && props.initialPartyId ? { kind: "existing", partyId: "", name: "" } : person}
        onChange={setPerson}
        label={t("who")}
        skeleton={props.skeleton}
      />

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("direction")}</span>
        <Segmented
          ariaLabel={t("direction")}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "THEY_OWE", label: person ? t("theyOwe", { name }) : t("theyOweGeneric") },
            { value: "I_OWE", label: t("iOwe") },
          ]}
        />
      </div>

      {itemsOn ? (
        <div className="flex flex-col gap-4">
          <ItemList
            items={items}
            onChange={(next) => {
              setItems(next);
              scan.unmark("items");
            }}
            newItem={newRow}
            label={
              <>
                {t("items")} <ScanMark show={scan.marked.has("items")} />
              </>
            }
          />
          <AdjustmentFields
            value={adj}
            subtotal={itemsSubtotal}
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
                  {tscan("mismatch", {
                    diff: money(Math.abs(mismatch), currency, locale),
                    dir: mismatch > 0 ? "over" : "under",
                    total: money(scan.receipt.total, currency, locale),
                  })}
                </p>
              ) : null
            }
          />
        </div>
      ) : (
        <MoneyInput
          label={
            <>
              {t("amount")} <ScanMark show={scan.marked.has("amount")} />
            </>
          }
          value={amountRaw}
          currency={currency}
          skeleton={props.skeleton}
          invalidHint={te("INVALID_INPUT")}
          onChange={(raw, parsed) => {
            setAmountRaw(raw);
            setAmount(parsed);
            scan.unmark("amount");
          }}
        />
      )}
      {plan !== "repeat" ? (
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          {t("useItems")}
          <Switch
            checked={itemsOn}
            onCheckedChange={(on) => {
              setUseItems(on);

              if (on && itemsSubtotal === 0)
                setItems([{ id: uuidv7(), name: title.trim(), raw: amount ? amountRaw : "" }]);
              if (!on && finalAmount) {
                setAmountRaw(toInputString(finalAmount, currency));
                setAmount(finalAmount);
              }
            }}
          />
        </label>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">
          {t("title")} <ScanMark show={scan.marked.has("title")} />
        </Label>
        <Input
          id="title"
          value={title}
          maxLength={100}
          onChange={(e) => {
            setTitle(e.target.value);
            scan.unmark("title");
          }}
          placeholder={t("titlePlaceholder")}
        />
        {scan.marked.has("category") && category ? (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>
              {t("category")}: <b className="font-semibold text-foreground">{tcat(category)}</b>
            </span>
            <ScanMark show />
          </span>
        ) : suggested ? (
          <span className="text-[13px] text-muted-foreground">
            {t("category")}: <b className="font-semibold text-foreground">{tcat(suggested)}</b>
            {guessSource === "memory" ? ` · ${t("guessMemory")}` : guessSource === "ai" ? ` · ${t("guessAi")}` : ""}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("plan")}</span>
        <Segmented
          ariaLabel={t("plan")}
          value={plan}
          onChange={setPlan}
          options={[
            { value: "once", label: t("planOnce") },
            { value: "installments", label: t("planInstallments"), tour: "debt.plan.installments" },
            { value: "repeat", label: t("planRepeat"), tour: "debt.plan.repeat" },
          ]}
        />
      </div>

      {plan === "once" ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">{t("due")}</span>
          <Chips
            ariaLabel={t("due")}
            value={due}
            onChange={setDue}
            options={[
              { value: "none", label: t("dueNone") },
              { value: "week", label: t("dueWeek") },
              { value: "month", label: t("dueEndMonth") },
              { value: "pick", label: t("duePick") },
            ]}
          />
          {due === "pick" ? (
            <Input
              type="date"
              value={dueDate}
              min={date}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label={t("duePick")}
            />
          ) : null}
        </div>
      ) : plan === "installments" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inst-count">{t("instCount")}</Label>
              <Input
                id="inst-count"
                inputMode="numeric"
                value={instCount}
                onChange={(e) => setInstCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                aria-invalid={!countValid}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-muted-foreground">{t("instEvery")}</span>
              <Chips
                ariaLabel={t("instEvery")}
                value={instEvery}
                onChange={setInstEvery}
                options={[
                  { value: "MONTH", label: t("perMonth") },
                  { value: "WEEK", label: t("perWeek") },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inst-first">{t("instFirst")}</Label>
            <Input
              id="inst-first"
              type="date"
              value={instFirst}
              min={date}
              onChange={(e) => setInstFirst(e.target.value)}
            />
          </div>
          <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] leading-snug">
            {schedule
              ? t("instPreview", {
                  count: schedule.length,
                  amount: money(schedule[0]!.amount, currency, locale),
                  first: formatDate(schedule[0]!.dueOn, locale),
                  last: formatDate(schedule.at(-1)!.dueOn, locale),
                })
              : t("instInvalid", { min: INSTALLMENTS_MIN, max: INSTALLMENTS_MAX })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Chips
            ariaLabel={t("planRepeat")}
            value={repeatEvery}
            onChange={setRepeatEvery}
            options={[
              { value: "WEEK", label: t("perWeek") },
              { value: "MONTH", label: t("perMonth") },
              { value: "YEAR", label: t("perYear") },
            ]}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("due")}</span>
            <Chips
              ariaLabel={t("due")}
              value={repeatDue}
              onChange={setRepeatDue}
              options={[
                { value: "none", label: t("dueNone") },

                ...[...new Set(["3", "7", repeatDue].filter((v) => v !== "none"))]
                  .sort((a, b) => Number(a) - Number(b))
                  .map((v) => ({ value: v, label: t("dueAfterDays", { days: Number(v) }) })),
              ]}
            />
          </div>
          <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] leading-snug">
            {t("repeatPreview", {
              amount: finalAmount ? money(finalAmount, currency, locale) : "…",
              every: tr(`every.${repeatEvery}`),
              start: formatDate(date, locale),
            })}
          </p>
        </div>
      )}

      <button
        type="button"
        className="flex items-center gap-1.5 self-start text-sm font-semibold"
        aria-expanded={more}
        onClick={() => setMore((m) => !m)}
      >
        {t("more")}
        <ChevronDown className={`size-4 transition-transform ${more ? "rotate-180" : ""}`} />
      </button>

      {more ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("category")}</span>
            <Chips
              ariaLabel={t("category")}
              value={effectiveCategory}
              onChange={(c) => {
                setCategoryTouched(true);
                setCategory(c);
                scan.unmark("category");
              }}
              options={CATEGORIES.map((c) => ({ value: c, label: tcat(c) }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">
                {t("date")} <ScanMark show={scan.marked.has("date")} />
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                max={props.today}
                onChange={(e) => {
                  setDate(e.target.value);
                  scan.unmark("date");
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">
                {t("currency")} <ScanMark show={scan.marked.has("currency")} />
              </Label>
              <CurrencyField
                id="currency"
                value={currency}
                onChange={(c) => {
                  setCurrency(c);
                  scan.unmark("currency");
                }}
                base={props.currency}
                title={t("currency")}
              />
            </div>
          </div>
          {plan !== "repeat" ? <LabelInput value={labels} onChange={setLabels} /> : null}
          {personGroups.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="group">{t("group")}</Label>
              <NativeSelect
                id="group"
                value={effectiveGroup ?? ""}
                onChange={(e) => setGroupId(e.target.value || null)}
              >
                <option value="">{t("noGroup")}</option>
                {personGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">
              {t("note")} <span className="font-normal">({tc("optional")})</span>
            </Label>
            <Textarea id="note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={!valid || pending} className="mt-2" data-tour="debt.submit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {tc("save")}
      </Button>
    </form>
  );
}

export function DebtFormSkeleton({ withPerson = false }: { withPerson?: boolean }) {
  return (
    <DebtForm
      skeleton
      people={[]}
      groups={[]}
      initialPartyId={withPerson ? "_" : null}
      initialGroupId={null}
      currency="IDR"
      today="2000-01-01"
    />
  );
}
