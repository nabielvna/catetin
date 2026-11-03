import type { LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { Minor } from "@/domain/money";

export type OpenObligation = {
  id: string;

  // Pending payment allocations are already deducted.
  available: Minor;
  dueOn: LocalDate | null;
  occurredOn: LocalDate;
  createdAt: number;
};

export type Allocation = { obligationId: string; amount: Minor };

export function sortForAllocation<T extends OpenObligation>(open: readonly T[]): T[] {
  return [...open].sort((a, b) => {
    if (a.dueOn !== b.dueOn) {
      if (a.dueOn === null) return 1;
      if (b.dueOn === null) return -1;
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : 1;
  });
}

export function totalAvailable(open: readonly OpenObligation[]): Minor {
  return open.reduce((s, o) => s + Math.max(0, o.available), 0);
}

export function planAutoAllocation(open: readonly OpenObligation[], amount: Minor): Allocation[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError("INVALID_INPUT");
  if (amount > totalAvailable(open)) {
    throw new DomainError("OVERPAY", { max: totalAvailable(open) });
  }
  const result: Allocation[] = [];
  let left = amount;
  for (const o of sortForAllocation(open)) {
    if (left === 0) break;
    if (o.available <= 0) continue;
    const take = Math.min(left, o.available);
    result.push({ obligationId: o.id, amount: take });
    left -= take;
  }
  return result;
}

export function validateManualAllocation(
  open: readonly OpenObligation[],
  requested: readonly Allocation[],
  amount: Minor,

  allowLess = false,
): Allocation[] {
  const byId = new Map(open.map((o) => [o.id, o]));
  const seen = new Set<string>();
  let sum = 0;
  const result: Allocation[] = [];
  for (const r of requested) {
    if (r.amount === 0) continue;
    if (!Number.isSafeInteger(r.amount) || r.amount < 0) throw new DomainError("INVALID_INPUT");
    const o = byId.get(r.obligationId);
    if (!o) throw new DomainError("NOT_FOUND");
    if (seen.has(r.obligationId)) throw new DomainError("INVALID_INPUT");
    seen.add(r.obligationId);
    if (r.amount > o.available) throw new DomainError("OVERPAY", { max: o.available });
    sum += r.amount;
    result.push({ obligationId: r.obligationId, amount: r.amount });
  }
  if (result.length === 0 || (allowLess ? sum > amount : sum !== amount)) {
    throw new DomainError("INVALID_INPUT", { field: "allocations" });
  }
  return result;
}

export function planWithExcess(
  open: readonly OpenObligation[],
  amount: Minor,
  requested?: readonly Allocation[] | null,
): { allocations: Allocation[]; excess: Minor } {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError("INVALID_INPUT");
  if (requested && requested.length > 0) {
    const allocations = validateManualAllocation(open, requested, amount, true);
    return { allocations, excess: amount - allocations.reduce((s, a) => s + a.amount, 0) };
  }
  const total = totalAvailable(open);
  if (total === 0) throw new DomainError("OVERPAY", { max: 0 });
  if (amount <= total) return { allocations: planAutoAllocation(open, amount), excess: 0 };
  return { allocations: planAutoAllocation(open, total), excess: amount - total };
}

export function planOffset(
  directionA: readonly OpenObligation[],
  directionB: readonly OpenObligation[],
  amountA: Minor,
  amountB: Minor,
): { a: Allocation[]; b: Allocation[] } {
  if (totalAvailable(directionA) === 0 || totalAvailable(directionB) === 0) {
    throw new DomainError("NOTHING_TO_OFFSET");
  }
  return { a: planAutoAllocation(directionA, amountA), b: planAutoAllocation(directionB, amountB) };
}

export function maxOffset(directionA: readonly OpenObligation[], directionB: readonly OpenObligation[]): Minor {
  return Math.min(totalAvailable(directionA), totalAvailable(directionB));
}
