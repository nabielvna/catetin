import type { Currency } from "@/domain/money";

export type StatementEntry = {
  kind: "OBLIGATION" | "SETTLEMENT";
  id: string;
  date: string;
  title: string;
  amount: number;
  currency: Currency;
  direction: "THEY_OWE" | "I_OWE" | "IN" | "OUT";
  status: string;
  settlementKind: "PAYMENT" | "FORGIVE" | "OFFSET" | null;
  groupName: string | null;
};

export function statementRows<T extends StatementEntry>(entriesNewestFirst: readonly T[]) {
  const running: Partial<Record<Currency, number>> = {};
  return [...entriesNewestFirst]
    .filter((e) => e.status === "ACTIVE")
    .reverse()
    .map((e) => {
      const delta =
        e.kind === "OBLIGATION"
          ? e.direction === "THEY_OWE"
            ? e.amount
            : -e.amount
          : e.direction === "IN"
            ? -e.amount
            : e.amount;

      const d = e.settlementKind === "OFFSET" ? 0 : delta;
      running[e.currency] = (running[e.currency] ?? 0) + d;
      return { ...e, delta: d, balance: running[e.currency]! };
    });
}
