import { type Currency } from "@/domain/money";

export type Output = {
  status: "saved" | "cancelled";
  id?: string;
  pending?: boolean;
  recurring?: boolean;
  partyId?: string;
  title?: string;
  amount?: number;
  total?: number;
  currency?: string;
};

export type DebtInput = {
  person: { partyId?: string; newPersonName?: string };
  direction: "THEY_OWE" | "I_OWE";
  amount: number;
  currency?: Currency;
  title: string;
  category?: string;
  occurredOn?: string;
  dueOn?: string;
  groupId?: string;
  note?: string;
  installments?: { count: number; every: "WEEK" | "MONTH"; firstDue: string };
  repeat?: { every: "WEEK" | "MONTH" | "YEAR"; dueAfterDays?: number };
  labels?: string[];
  attachPhoto?: boolean;
};

export type PaymentInput = {
  partyId: string;
  direction: "IN" | "OUT";
  amount?: number;
  currency?: Currency;
  method?: "CASH" | "TRANSFER" | "EWALLET" | "OTHER";
  paidOn?: string;
  debtCurrency?: Currency;
  allowExcess?: boolean;
  groupId?: string;
  note?: string;
  attachPhoto?: boolean;
};

export type { Directory, Ref, BillInput } from "@/domain/assistant-drafts";
