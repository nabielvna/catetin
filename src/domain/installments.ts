import { addDays, endOfMonth, isLocalDate, type LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { Minor } from "@/domain/money";

export const INSTALLMENT_PERIODS = ["WEEK", "MONTH"] as const;
export type InstallmentPeriod = (typeof INSTALLMENT_PERIODS)[number];
export const INSTALLMENTS_MIN = 2;
export const INSTALLMENTS_MAX = 120;

export type InstallmentPlan = { count: number; every: InstallmentPeriod; firstDue: LocalDate };
export type Installment = { seq: number; dueOn: LocalDate; amount: Minor };

export function addPeriods(start: LocalDate, every: "WEEK" | "MONTH" | "YEAR", n: number): LocalDate {
  if (every === "WEEK") return addDays(start, 7 * n);
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const months = every === "MONTH" ? n : 12 * n;
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const first = `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-01`;
  const last = Number(endOfMonth(first).slice(8, 10));
  return `${first.slice(0, 8)}${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function isInstallmentPlan(v: unknown): v is InstallmentPlan {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.count === "number" &&
    typeof p.firstDue === "string" &&
    (INSTALLMENT_PERIODS as readonly unknown[]).includes(p.every)
  );
}

export function assertValidPlan(plan: InstallmentPlan, amount: Minor): void {
  if (!Number.isInteger(plan.count) || plan.count < INSTALLMENTS_MIN || plan.count > INSTALLMENTS_MAX) {
    throw new DomainError("INVALID_INPUT", { field: "installments" });
  }
  if (!(INSTALLMENT_PERIODS as readonly string[]).includes(plan.every) || !isLocalDate(plan.firstDue)) {
    throw new DomainError("INVALID_INPUT", { field: "installments" });
  }

  if (amount < plan.count) throw new DomainError("INVALID_INPUT", { field: "installments" });
}

export function scheduleOf(amount: Minor, plan: InstallmentPlan): Installment[] {
  const base = Math.floor(amount / plan.count);
  const out: Installment[] = [];
  for (let i = 0; i < plan.count; i++) {
    out.push({
      seq: i + 1,
      dueOn: addPeriods(plan.firstDue, plan.every, i),
      amount: i === plan.count - 1 ? amount - base * (plan.count - 1) : base,
    });
  }
  return out;
}

export type NextInstallment = Installment & {
  dueAmount: Minor;

  cumulative: Minor;
};

export function nextInstallment(amount: Minor, plan: InstallmentPlan, paid: Minor): NextInstallment | null {
  let cumulative = 0;
  for (const it of scheduleOf(amount, plan)) {
    cumulative += it.amount;
    if (cumulative > paid) return { ...it, cumulative, dueAmount: cumulative - paid };
  }
  return null;
}

export function effectiveDueOn(
  amount: Minor,
  plan: InstallmentPlan | null | undefined,
  dueOn: LocalDate | null,
  paid: Minor,
): LocalDate | null {
  if (!plan) return dueOn;
  const next = nextInstallment(amount, plan, paid);
  if (next) return next.dueOn;
  return scheduleOf(amount, plan).at(-1)!.dueOn;
}

export type DueShape = { amount: Minor; dueOn: LocalDate | null; installments: InstallmentPlan | null };

function steps(s: DueShape): Array<[LocalDate, Minor]> {
  if (s.installments) {
    let c = 0;
    return scheduleOf(s.amount, s.installments).map((it) => [it.dueOn, (c += it.amount)]);
  }
  return s.dueOn ? [[s.dueOn, s.amount]] : [];
}

function cumulativeAt(st: Array<[LocalDate, Minor]>, date: LocalDate): Minor {
  let v = 0;
  for (const [d, c] of st) if (d <= date) v = c;
  return v;
}

export function compareDueShapes(from: DueShape, to: DueShape): "SAME" | "MORE" | "LESS" | "MIXED" {
  const a = steps(from);
  const b = steps(to);
  const dates = [...new Set([...a.map((x) => x[0]), ...b.map((x) => x[0])])];
  let more = to.amount > from.amount;
  let less = to.amount < from.amount;
  for (const d of dates) {
    const va = cumulativeAt(a, d);
    const vb = cumulativeAt(b, d);
    if (vb > va) more = true;
    if (vb < va) less = true;
  }
  if (more && less) return "MIXED";
  if (more) return "MORE";
  if (less) return "LESS";
  return "SAME";
}
