import { DomainError } from "@/domain/errors";
import { allocateByWeights, MAX_MINOR, type Minor } from "@/domain/money";

export type SplitMode = "EQUAL" | "ITEMS" | "EXACT" | "PERCENT" | "SHARES";

export type SplitItem = {
  id: string;
  name: string;

  amount: Minor;

  assignees?: string[];
};

export type Adjustment = { type: "AMOUNT"; value: Minor } | { type: "PERCENT"; bps: number };

export type SplitInput = {
  participants: string[];
  mode: SplitMode;
  items?: SplitItem[];

  subtotal?: Minor;

  exact?: Record<string, Minor>;

  percent?: Record<string, number>;

  shares?: Record<string, number>;
  discount?: Adjustment | null;
  serviceBps?: number;
  taxBps?: number;

  serviceAmount?: Minor;
  taxAmount?: Minor;
  taxIncludesService?: boolean;
};

export type ParticipantShare = {
  partyId: string;
  base: Minor;
  discount: Minor;
  service: Minor;
  tax: Minor;
  total: Minor;
};

export type SplitResult = {
  subtotal: Minor;
  discount: Minor;
  service: Minor;
  tax: Minor;
  total: Minor;
  shares: ParticipantShare[];
};

function pct(amount: Minor, bps: number): Minor {
  return Number((BigInt(amount) * BigInt(bps) * 2n + 10_000n) / 20_000n);
}

function assertBps(bps: number | undefined, max = 100_00): number {
  const v = bps ?? 0;
  if (!Number.isSafeInteger(v) || v < 0 || v > max) {
    throw new DomainError("SPLIT_INVALID", { reason: "bps" });
  }
  return v;
}

function assertAmount(v: Minor): Minor {
  if (!Number.isSafeInteger(v) || v < 0 || v > MAX_MINOR) throw new DomainError("SPLIT_INVALID", { reason: "amount" });
  return v;
}

export function computeSplit(input: SplitInput): SplitResult {
  const participants = input.participants;
  if (participants.length === 0 || new Set(participants).size !== participants.length) {
    throw new DomainError("SPLIT_INVALID", { reason: "participants" });
  }

  const items = input.items ?? [];
  for (const it of items) {
    if (!Number.isSafeInteger(it.amount) || it.amount < 0) {
      throw new DomainError("SPLIT_INVALID", { reason: "item" });
    }
  }
  const itemsTotal = items.reduce((s, it) => s + it.amount, 0);
  let subtotal: Minor;
  if (items.length > 0) {
    if (input.subtotal !== undefined && input.subtotal !== itemsTotal) {
      throw new DomainError("ITEMS_MISMATCH");
    }
    subtotal = itemsTotal;
  } else {
    if (input.mode === "ITEMS") throw new DomainError("SPLIT_INVALID", { reason: "items" });
    subtotal = input.subtotal ?? 0;
  }
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > MAX_MINOR) {
    throw new DomainError("SPLIT_INVALID", { reason: "subtotal" });
  }

  const base = computeBase(input, participants, items, subtotal);

  const discount = computeDiscount(input.discount ?? null, subtotal);
  const afterDiscount = subtotal - discount;
  const service =
    input.serviceAmount !== undefined
      ? assertAmount(input.serviceAmount)
      : pct(afterDiscount, assertBps(input.serviceBps));
  const taxBase = afterDiscount + (input.taxIncludesService === false ? 0 : service);
  const tax = input.taxAmount !== undefined ? assertAmount(input.taxAmount) : pct(taxBase, assertBps(input.taxBps));
  const total = afterDiscount + service + tax;

  const discShares = allocateByWeights(discount, base);
  const svcShares = allocateByWeights(service, base);
  const taxShares = allocateByWeights(tax, base);

  const shares = participants.map((partyId, i) => {
    const b = base[i] ?? 0;
    const d = discShares[i] ?? 0;
    const s = svcShares[i] ?? 0;
    const t = taxShares[i] ?? 0;
    return { partyId, base: b, discount: d, service: s, tax: t, total: b - d + s + t };
  });

  return { subtotal, discount, service, tax, total, shares };
}

function computeDiscount(discount: Adjustment | null, subtotal: Minor): Minor {
  if (!discount) return 0;
  if (discount.type === "AMOUNT") {
    if (!Number.isSafeInteger(discount.value) || discount.value < 0 || discount.value > subtotal) {
      throw new DomainError("SPLIT_INVALID", { reason: "discount" });
    }
    return discount.value;
  }
  return pct(subtotal, assertBps(discount.bps));
}

function computeBase(input: SplitInput, participants: string[], items: SplitItem[], subtotal: Minor): Minor[] {
  switch (input.mode) {
    case "EQUAL":
      return allocateByWeights(
        subtotal,
        participants.map(() => 1),
      );

    case "ITEMS": {
      const index = new Map(participants.map((p, i) => [p, i]));
      const base = participants.map(() => 0);
      for (const it of items) {
        const assignees = it.assignees ?? [];
        if (assignees.length === 0 || new Set(assignees).size !== assignees.length) {
          throw new DomainError("SPLIT_INVALID", { reason: "unassigned", item: it.id });
        }
        const parts = allocateByWeights(
          it.amount,
          assignees.map(() => 1),
        );
        assignees.forEach((a, k) => {
          const i = index.get(a);
          if (i === undefined) throw new DomainError("SPLIT_INVALID", { reason: "assignee" });
          base[i] = (base[i] ?? 0) + (parts[k] ?? 0);
        });
      }
      return base;
    }

    case "EXACT": {
      const exact = input.exact ?? {};
      const base = participants.map((p) => exact[p] ?? 0);
      if (base.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        throw new DomainError("SPLIT_INVALID", { reason: "exact" });
      }
      const sum = base.reduce((a, b) => a + b, 0);
      if (sum !== subtotal) {
        throw new DomainError("SPLIT_INVALID", { reason: "exact_sum", diff: subtotal - sum });
      }
      return base;
    }

    case "PERCENT": {
      const percent = input.percent ?? {};
      const bps = participants.map((p) => percent[p] ?? 0);
      if (bps.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        throw new DomainError("SPLIT_INVALID", { reason: "percent" });
      }
      if (bps.reduce((a, b) => a + b, 0) !== 10_000) {
        throw new DomainError("SPLIT_INVALID", { reason: "percent_sum" });
      }
      return allocateByWeights(subtotal, bps);
    }

    case "SHARES": {
      const shares = input.shares ?? {};
      const w = participants.map((p) => shares[p] ?? 0);
      if (w.some((v) => !Number.isSafeInteger(v) || v < 0) || w.every((v) => v === 0)) {
        throw new DomainError("SPLIT_INVALID", { reason: "shares" });
      }
      return allocateByWeights(subtotal, w);
    }
  }
}
