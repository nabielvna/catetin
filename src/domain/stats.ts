import { diffDays, endOfMonth, type LocalDate } from "@/domain/dates";
import type { Currency, Minor } from "@/domain/money";

export type StatPeriod = "month" | "quarter" | "year" | "all";
export const STAT_PERIODS: readonly StatPeriod[] = ["month", "quarter", "year", "all"];
export type Direction = "THEY_OWE" | "I_OWE";

export type StatObligation = {
  id: string;
  pairId: string;
  title: string;
  counterpartId: string;
  counterpartName: string;
  groupId: string | null;
  groupName: string | null;
  billId: string | null;
  direction: Direction;
  amount: Minor;
  paid: Minor;
  currency: Currency;
  category: string | null;
  labels: string[];
  status: string;
  occurredOn: LocalDate;
  dueOn: LocalDate | null;

  createdOn: LocalDate;
  installments: boolean;
  settledOn: LocalDate | null;
};

export type StatAllocation = { obligationId: string; amount: Minor; paidOn: LocalDate };
export type StatSettlement = {
  kind: "PAYMENT" | "FORGIVE" | "OFFSET" | "NETTING";
  method: string | null;

  direction: "IN" | "OUT";
  amount: Minor;
  currency: Currency;
  paidOn: LocalDate;
  status: string;
  counterpartId: string;
};

export type StatReminder = { pairId: string; byMe: boolean; on: LocalDate };

export type StatVote = { counterpartId: string; byMe: boolean; minutes: number; on: LocalDate };
export type StatBill = {
  groupId: string | null;
  payerId: string;
  payerName: string;
  payerIsMe: boolean;
  occurredOn: LocalDate;
  currency: Currency;
};

export type StatsInput = {
  obligations: StatObligation[];
  allocations: StatAllocation[];
  settlements: StatSettlement[];
  reminders: StatReminder[];
  votes: StatVote[];
  bills: StatBill[];
};

export type StatsOptions = { period: StatPeriod; currency: Currency; today: LocalDate };

export function periodStart(period: StatPeriod, today: LocalDate): LocalDate | null {
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "year") return `${y}-01-01`;
  if (period === "quarter") {
    const d = new Date(Date.UTC(y, m - 3, 1));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function lastMonths(today: LocalDate, n = 6): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7));
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const inPeriod = (date: LocalDate, from: LocalDate | null, today: LocalDate) =>
  (from === null || date >= from) && date <= today;
const isActive = (o: StatObligation) => o.status === "ACTIVE";
const isOpen = (o: StatObligation) => isActive(o) && o.paid < o.amount;

function mode<K>(items: K[]): { key: K; count: number } | null {
  const counts = new Map<K, number>();
  for (const k of items) counts.set(k, (counts.get(k) ?? 0) + 1);
  let best: { key: K; count: number } | null = null;
  for (const [key, count] of counts) if (!best || count > best.count) best = { key, count };
  return best;
}

export type Summary = {
  lent: Minor;
  lentCount: number;
  borrowed: Minor;
  borrowedCount: number;
  received: Minor;
  paid: Minor;
};

function summary(obs: StatObligation[], settlements: StatSettlement[]): Summary {
  const lent = obs.filter((o) => o.direction === "THEY_OWE");
  const borrowed = obs.filter((o) => o.direction === "I_OWE");
  const pays = settlements.filter((s) => s.kind === "PAYMENT");
  return {
    lent: sum(lent.map((o) => o.amount)),
    lentCount: lent.length,
    borrowed: sum(borrowed.map((o) => o.amount)),
    borrowedCount: borrowed.length,
    received: sum(pays.filter((s) => s.direction === "IN").map((s) => s.amount)),
    paid: sum(pays.filter((s) => s.direction === "OUT").map((s) => s.amount)),
  };
}

export type MonthBar = { month: string; lent: Minor; borrowed: Minor };

function monthly(active: StatObligation[], months: string[]): MonthBar[] {
  return months.map((month) => {
    const these = active.filter((o) => o.occurredOn.startsWith(month));
    return {
      month,
      lent: sum(these.filter((o) => o.direction === "THEY_OWE").map((o) => o.amount)),
      borrowed: sum(these.filter((o) => o.direction === "I_OWE").map((o) => o.amount)),
    };
  });
}

export type BalancePoint = { month: string; balance: Minor };

function balanceSeries(
  active: StatObligation[],
  allocations: StatAllocation[],
  months: string[],
  today: LocalDate,
): BalancePoint[] {
  const allocs = new Map<string, StatAllocation[]>();
  for (const a of allocations) allocs.set(a.obligationId, [...(allocs.get(a.obligationId) ?? []), a]);
  return months.map((month) => {
    const end = endOfMonth(`${month}-01`);
    const at = end > today ? today : end;
    let balance = 0;
    for (const o of active) {
      if (o.occurredOn > at) continue;
      const paid = sum((allocs.get(o.id) ?? []).filter((a) => a.paidOn <= at).map((a) => a.amount));
      const left = Math.max(0, o.amount - paid);
      balance += o.direction === "THEY_OWE" ? left : -left;
    }
    return { month, balance };
  });
}

export type PersonShare = { id: string; name: string; count: number; amount: Minor };
export type GroupBucket = {
  key: string;
  amount: Minor;
  count: number;
  top: PersonShare | null;

  in: PersonShare[];
  out: PersonShare[];
};

function shares(obs: StatObligation[]): PersonShare[] {
  const by = new Map<string, PersonShare>();
  for (const o of obs) {
    const p = by.get(o.counterpartId) ?? { id: o.counterpartId, name: o.counterpartName, count: 0, amount: 0 };
    p.count += 1;
    p.amount += o.amount;
    by.set(o.counterpartId, p);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function buckets(obs: StatObligation[], keysOf: (o: StatObligation) => string[]): GroupBucket[] {
  const by = new Map<string, StatObligation[]>();
  for (const o of obs) for (const k of keysOf(o)) by.set(k, [...(by.get(k) ?? []), o]);
  return [...by]
    .map(([key, list]) => {
      const all = shares(list);
      const top = [...all].sort((a, b) => b.count - a.count || b.amount - a.amount)[0] ?? null;
      return {
        key,
        amount: sum(list.map((o) => o.amount)),
        count: list.length,
        top,
        in: shares(list.filter((o) => o.direction === "THEY_OWE")),
        out: shares(list.filter((o) => o.direction === "I_OWE")),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export type Habits = {
  settledCount: number;
  medianDays: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
  dueCount: number;
  onTime: number;
  avgLateDays: number | null;
  remindersAvg: number | null;
  confirmMinutes: number | null;
  installments: number;
  favoriteMethod: { method: string; share: number } | null;
  openCount: number;
  openAmount: Minor;
  oldestOpenDays: number | null;
};

function habits(
  dir: Direction,
  input: StatsInput,
  obs: StatObligation[],
  from: LocalDate | null,
  today: LocalDate,
  currency: Currency,
): Habits {
  const mine = obs.filter((o) => o.direction === dir && isActive(o));
  const settled = mine.filter((o) => o.paid >= o.amount && o.settledOn && inPeriod(o.settledOn, from, today));
  const days = settled.map((o) => Math.max(0, diffDays(o.occurredOn, o.settledOn!)));
  const withDue = settled.filter((o) => o.dueOn);
  const late = withDue.filter((o) => o.settledOn! > o.dueOn!).map((o) => diffDays(o.dueOn!, o.settledOn!));

  const remindersByMe = dir === "THEY_OWE";
  const reminders = settled.map(
    (o) =>
      input.reminders.filter(
        (r) => r.pairId === o.pairId && r.byMe === remindersByMe && r.on >= o.occurredOn && r.on <= o.settledOn!,
      ).length,
  );

  const people = new Set(obs.map((o) => o.counterpartId));
  const confirm = input.votes
    .filter((v) => v.byMe === (dir === "I_OWE") && people.has(v.counterpartId) && inPeriod(v.on, from, today))
    .map((v) => v.minutes);
  const pays = input.settlements.filter(
    (s) =>
      s.kind === "PAYMENT" &&
      s.status === "ACTIVE" &&
      s.currency === currency &&
      s.method &&
      s.direction === (dir === "THEY_OWE" ? "IN" : "OUT") &&
      people.has(s.counterpartId) &&
      inPeriod(s.paidOn, from, today),
  );
  const fav = mode(pays.map((s) => s.method!));
  const open = mine.filter(isOpen);
  return {
    settledCount: settled.length,
    medianDays: median(days),
    fastestDays: days.length ? Math.min(...days) : null,
    slowestDays: days.length ? Math.max(...days) : null,
    dueCount: withDue.length,
    onTime: withDue.length - late.length,
    avgLateDays: mean(late),
    remindersAvg: settled.length ? Math.round((sum(reminders) / settled.length) * 10) / 10 : null,
    confirmMinutes: median(confirm),
    installments: mine.filter((o) => o.installments && inPeriod(o.occurredOn, from, today)).length,
    favoriteMethod: fav ? { method: fav.key, share: Math.round((fav.count / pays.length) * 100) } : null,
    openCount: open.length,
    openAmount: sum(open.map((o) => o.amount - o.paid)),
    oldestOpenDays: open.length ? Math.max(...open.map((o) => diffDays(o.occurredOn, today))) : null,
  };
}

export type AgingBucket = { bucket: "0-7" | "8-30" | "31-90" | "90+"; amount: Minor; count: number };

function aging(open: StatObligation[], today: LocalDate): AgingBucket[] {
  const order: AgingBucket["bucket"][] = ["0-7", "8-30", "31-90", "90+"];
  const of = (days: number): AgingBucket["bucket"] =>
    days <= 7 ? "0-7" : days <= 30 ? "8-30" : days <= 90 ? "31-90" : "90+";
  return order.map((bucket) => {
    const these = open.filter((o) => of(diffDays(o.occurredOn, today)) === bucket);
    return { bucket, amount: sum(these.map((o) => o.amount - o.paid)), count: these.length };
  });
}

export type PersonRow = {
  id: string;
  name: string;
  lent: Minor;
  lentCount: number;
  borrowed: Minor;
  borrowedCount: number;

  theirDays: number | null;
  myDays: number | null;
};

export type GroupRow = {
  id: string;
  name: string;
  count: number;
  amount: Minor;
  topCategory: { key: string; share: number } | null;

  topPayer: { name: string; isMe: boolean; count: number } | null;
};

export type Stats = {
  currency: Currency;
  period: StatPeriod;
  from: LocalDate | null;
  summary: Summary;
  months: MonthBar[];
  balance: BalancePoint[];
  categories: GroupBucket[];
  labels: GroupBucket[];
  people: PersonRow[];
  habits: { them: Habits; me: Habits };
  aging: AgingBucket[];
  oldestOpen: { id: string; title: string; name: string; days: number } | null;
  groups: GroupRow[];
  facts: {
    avgAmount: Minor | null;
    biggest: { id: string; title: string; name: string; amount: Minor } | null;
    topMethod: { method: string; share: number } | null;
    bills: { count: number; avgShare: Minor } | null;
    forgiven: { amount: Minor; count: number };
    offsets: { amount: Minor; count: number };

    busiestWeekday: number | null;
  };
};

function forCurrency(input: StatsInput, currency: Currency): StatsInput {
  const obligations = input.obligations.filter((o) => o.currency === currency);
  const ids = new Set(obligations.map((o) => o.id));
  return {
    ...input,
    obligations,
    allocations: input.allocations.filter((a) => ids.has(a.obligationId)),
    settlements: input.settlements.filter((s) => s.currency === currency),
    bills: input.bills.filter((b) => b.currency === currency),
  };
}

export function computeStats(raw: StatsInput, { period, currency, today }: StatsOptions): Stats {
  const input = forCurrency(raw, currency);
  const from = periodStart(period, today);
  const active = input.obligations.filter(isActive);
  const inP = active.filter((o) => inPeriod(o.occurredOn, from, today));
  const settlementsP = input.settlements.filter((s) => s.status === "ACTIVE" && inPeriod(s.paidOn, from, today));
  const months = lastMonths(today);

  const peopleBy = new Map<string, StatObligation[]>();
  for (const o of active) peopleBy.set(o.counterpartId, [...(peopleBy.get(o.counterpartId) ?? []), o]);
  const people: PersonRow[] = [...peopleBy]
    .map(([id, list]) => {
      const p = list.filter((o) => inPeriod(o.occurredOn, from, today));
      const settledDays = (dir: Direction) =>
        median(
          list
            .filter(
              (o) => o.direction === dir && o.paid >= o.amount && o.settledOn && inPeriod(o.settledOn, from, today),
            )
            .map((o) => Math.max(0, diffDays(o.occurredOn, o.settledOn!))),
        );
      return {
        id,
        name: list[0]!.counterpartName,
        lent: sum(p.filter((o) => o.direction === "THEY_OWE").map((o) => o.amount)),
        lentCount: p.filter((o) => o.direction === "THEY_OWE").length,
        borrowed: sum(p.filter((o) => o.direction === "I_OWE").map((o) => o.amount)),
        borrowedCount: p.filter((o) => o.direction === "I_OWE").length,
        theirDays: settledDays("THEY_OWE"),
        myDays: settledDays("I_OWE"),
      };
    })
    .filter((p) => p.lentCount + p.borrowedCount > 0 || p.theirDays !== null || p.myDays !== null)
    .sort(
      (a, b) =>
        b.lentCount + b.borrowedCount - (a.lentCount + a.borrowedCount) || b.lent + b.borrowed - (a.lent + a.borrowed),
    );

  const openOwed = active.filter((o) => isOpen(o) && o.direction === "THEY_OWE");
  const oldest = [...openOwed].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))[0];

  const groupsBy = new Map<string, StatObligation[]>();
  for (const o of inP) if (o.groupId) groupsBy.set(o.groupId, [...(groupsBy.get(o.groupId) ?? []), o]);
  const groups: GroupRow[] = [...groupsBy]
    .map(([id, list]) => {
      const amount = sum(list.map((o) => o.amount));
      const cat = buckets(list, (o) => [o.category ?? "OTHER"])[0];
      const payers = input.bills.filter((b) => b.groupId === id && inPeriod(b.occurredOn, from, today));
      const top = mode(payers.map((b) => b.payerId));
      const payer = top ? payers.find((b) => b.payerId === top.key)! : null;
      return {
        id,
        name: list[0]!.groupName ?? "?",
        count: list.length,
        amount,
        topCategory: cat && amount > 0 ? { key: cat.key, share: Math.round((cat.amount / amount) * 100) } : null,
        topPayer: payer ? { name: payer.payerName, isMe: payer.payerIsMe, count: top!.count } : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const biggest = [...inP].sort((a, b) => b.amount - a.amount)[0];
  const pays = settlementsP.filter((s) => s.kind === "PAYMENT" && s.method);
  const method = mode(pays.map((s) => s.method!));
  const billObs = inP.filter((o) => o.billId);
  const weekday = mode(inP.map((o) => new Date(`${o.createdOn}T00:00:00Z`).getUTCDay()));
  const forgiven = settlementsP.filter((s) => s.kind === "FORGIVE" && s.direction === "IN");
  const offsets = settlementsP.filter((s) => s.kind === "OFFSET");

  return {
    currency,
    period,
    from,
    summary: summary(inP, settlementsP),
    months: monthly(active, months),
    balance: balanceSeries(active, input.allocations, months, today),
    categories: buckets(inP, (o) => [o.category ?? "OTHER"]),
    labels: buckets(inP, (o) => [...new Set(o.labels)]),
    people,
    habits: {
      them: habits("THEY_OWE", input, input.obligations, from, today, currency),
      me: habits("I_OWE", input, input.obligations, from, today, currency),
    },
    aging: aging(openOwed, today),
    oldestOpen: oldest
      ? { id: oldest.id, title: oldest.title, name: oldest.counterpartName, days: diffDays(oldest.occurredOn, today) }
      : null,
    groups,
    facts: {
      avgAmount: mean(inP.map((o) => o.amount)),
      biggest: biggest
        ? {
            id: biggest.id,
            title: biggest.title,
            name: biggest.groupName ?? biggest.counterpartName,
            amount: biggest.amount,
          }
        : null,
      topMethod: method ? { method: method.key, share: Math.round((method.count / pays.length) * 100) } : null,
      bills: billObs.length
        ? { count: new Set(billObs.map((o) => o.billId)).size, avgShare: mean(billObs.map((o) => o.amount))! }
        : null,
      forgiven: { amount: sum(forgiven.map((s) => s.amount)), count: forgiven.length },
      offsets: { amount: sum(offsets.map((s) => s.amount)), count: offsets.length },
      busiestWeekday: weekday && inP.length >= 5 ? weekday.key : null,
    },
  };
}

export type PersonStats = {
  currency: Currency;
  period: StatPeriod;
  summary: Summary;
  months: MonthBar[];

  categoriesIn: GroupBucket[];
  categoriesOut: GroupBucket[];
  habits: { them: Habits; me: Habits };

  avgIn: Minor | null;
  avgOut: Minor | null;
};

export function computePersonStats(
  raw: StatsInput,
  personId: string,
  { period, currency, today }: StatsOptions,
): PersonStats {
  const all = forCurrency(raw, currency);
  const obligations = all.obligations.filter((o) => o.counterpartId === personId);
  const pairs = new Set(obligations.map((o) => o.pairId));
  const input: StatsInput = {
    obligations,
    allocations: all.allocations,
    settlements: all.settlements.filter((s) => s.counterpartId === personId),
    reminders: all.reminders.filter((r) => pairs.has(r.pairId)),
    votes: all.votes.filter((v) => v.counterpartId === personId),
    bills: [],
  };
  const from = periodStart(period, today);
  const active = obligations.filter(isActive);
  const inP = active.filter((o) => inPeriod(o.occurredOn, from, today));
  const settlementsP = input.settlements.filter((s) => s.status === "ACTIVE" && inPeriod(s.paidOn, from, today));
  return {
    currency,
    period,
    summary: summary(inP, settlementsP),
    months: monthly(active, lastMonths(today)),
    categoriesIn: buckets(
      inP.filter((o) => o.direction === "THEY_OWE"),
      (o) => [o.category ?? "OTHER"],
    ),
    categoriesOut: buckets(
      inP.filter((o) => o.direction === "I_OWE"),
      (o) => [o.category ?? "OTHER"],
    ),
    habits: {
      them: habits("THEY_OWE", input, obligations, from, today, currency),
      me: habits("I_OWE", input, obligations, from, today, currency),
    },
    avgIn: mean(inP.filter((o) => o.direction === "THEY_OWE").map((o) => o.amount)),
    avgOut: mean(inP.filter((o) => o.direction === "I_OWE").map((o) => o.amount)),
  };
}

export function statCurrencies(input: StatsInput, preferred: Currency): Currency[] {
  const counts = new Map<Currency, number>();
  for (const o of input.obligations) if (isActive(o)) counts.set(o.currency, (counts.get(o.currency) ?? 0) + 1);
  return [...counts].sort(([a, x], [b, y]) => (a === preferred ? -1 : b === preferred ? 1 : y - x)).map(([c]) => c);
}
