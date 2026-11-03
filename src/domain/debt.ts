import type { LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { InstallmentPlan } from "@/domain/installments";
import { type Currency, MAX_MINOR, type Minor } from "@/domain/money";
import type { ObligationChange } from "@/domain/policy";

export const OBLIGATION_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "VOID"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const TITLE_MAX = 100;
export const NOTE_MAX = 1000;
export const ITEMS_MAX = 100;

export type ObligationItemInput = {
  name: string;

  qtyMilli: number;
  unitPrice: Minor;
};

export function lineTotal(item: ObligationItemInput): Minor {
  return Math.floor((item.qtyMilli * item.unitPrice + 500) / 1000);
}

export function itemsTotal(items: readonly ObligationItemInput[]): Minor {
  return items.reduce((s, it) => s + lineTotal(it), 0);
}

// Negative item prices represent discounts. The final sum must still match the debt.
export function assertItemsMatch(items: readonly ObligationItemInput[], amount: Minor): void {
  if (items.length === 0) return;
  if (items.length > ITEMS_MAX) throw new DomainError("INVALID_INPUT", { field: "items" });
  for (const it of items) {
    if (!Number.isSafeInteger(it.qtyMilli) || it.qtyMilli <= 0) {
      throw new DomainError("INVALID_INPUT", { field: "qty" });
    }

    if (!Number.isSafeInteger(it.unitPrice) || Math.abs(it.unitPrice) > MAX_MINOR) {
      throw new DomainError("INVALID_INPUT", { field: "unitPrice" });
    }
  }
  if (itemsTotal(items) !== amount) {
    throw new DomainError("ITEMS_MISMATCH", { expected: amount, actual: itemsTotal(items) });
  }
}

export type ObligationSnapshot = {
  amount: Minor;
  currency: Currency;
  dueOn: LocalDate | null;
  title: string;
  note: string | null;
  category: string | null;
  occurredOn: LocalDate;
  itemsKey: string;

  installments?: InstallmentPlan | null;
};

export type ObligationPatch = Partial<Omit<ObligationSnapshot, "itemsKey">> & { itemsKey?: string };

function samePlan(a: InstallmentPlan | null | undefined, b: InstallmentPlan | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.count === b.count && a.every === b.every && a.firstDue === b.firstDue;
}

export const METADATA_FIELDS = ["title", "note", "category", "occurredOn", "itemsKey"] as const;

export function diffObligation(
  current: ObligationSnapshot,
  patch: ObligationPatch,
): { change: ObligationChange; changedFields: string[] } {
  const change: ObligationChange = {};
  const changedFields: string[] = [];

  if (patch.currency !== undefined && patch.currency !== current.currency) {
    throw new DomainError("CURRENCY_CHANGE");
  }
  if (patch.amount !== undefined && patch.amount !== current.amount) {
    change.amount = { from: current.amount, to: patch.amount };
    changedFields.push("amount");
  }
  const planChanged = patch.installments !== undefined && !samePlan(patch.installments, current.installments);
  const nextPlan = patch.installments !== undefined ? patch.installments : (current.installments ?? null);
  if (planChanged) changedFields.push("installments");
  if (!nextPlan && patch.dueOn !== undefined && patch.dueOn !== current.dueOn) {
    change.dueOn = { from: current.dueOn, to: patch.dueOn };
    changedFields.push("dueOn");
  }
  if (current.installments || nextPlan) {
    const from = { amount: current.amount, dueOn: current.dueOn, installments: current.installments ?? null };
    const to = {
      amount: patch.amount ?? current.amount,
      dueOn: nextPlan ? null : patch.dueOn !== undefined ? patch.dueOn : current.dueOn,
      installments: nextPlan,
    };
    if (planChanged || change.amount || change.dueOn) {
      change.schedule = { from: { ...from, dueOn: from.installments ? null : from.dueOn }, to };
    }
  }
  for (const f of METADATA_FIELDS) {
    const next = patch[f];
    if (next !== undefined && next !== current[f]) {
      change.metadata = true;
      changedFields.push(f);
    }
  }
  return { change, changedFields };
}

export function isMetadataOnly(change: ObligationChange): boolean {
  return !change.amount && !change.dueOn && !change.schedule;
}

export const CATEGORIES = [
  "FOOD",
  "SHOPPING",
  "TRANSPORT",
  "BILLS",
  "RENT",
  "ENTERTAINMENT",
  "HEALTH",
  "EDUCATION",
  "TRAVEL",
  "CASH_LOAN",
  "SHARED",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  [
    "FOOD",
    /\b(makan|minum|kopi|coffee|ngopi|sarapan|lunch|dinner|bakso|mie|nasi|ayam|pizza|burger|jajan|snack|gofood|grabfood|shopeefood|resto|warung|boba|teh|martabak|seblak|sate|soto)\b/,
  ],
  [
    "TRANSPORT",
    /\b(bensin|parkir|tol|ojek|ojol|gojek|grab|taksi|taxi|krl|mrt|busway|transjakarta|bus|kereta|tiket kereta|pertalite|pertamax|bbm|angkot|travel)\b/,
  ],
  [
    "BILLS",
    /\b(listrik|pln|token|air|pdam|wifi|internet|pulsa|kuota|paket data|tagihan|bpjs|langganan|netflix|spotify)\b/,
  ],
  ["RENT", /\b(kos|kost|sewa|kontrakan|apartemen|indekos)\b/],
  ["ENTERTAINMENT", /\b(nonton|bioskop|film|konser|karaoke|game|main|tiket konser|hiburan)\b/],
  ["HEALTH", /\b(obat|dokter|apotek|rumah sakit|rs|klinik|vitamin|periksa)\b/],
  ["EDUCATION", /\b(buku|kuliah|ukt|spp|kursus|les|print|fotokopi|sekolah|seminar)\b/],
  ["TRAVEL", /\b(liburan|hotel|villa|pesawat|tiket pesawat|trip|jalan-jalan|staycation|airbnb)\b/],
  ["SHOPPING", /\b(belanja|beli|baju|sepatu|shopee|tokopedia|tokped|lazada|indomaret|alfamart|supermarket)\b/],
  ["CASH_LOAN", /\b(pinjam|pinjem|minjem|utang tunai|tunai|cash|transfer dulu|talangin|nalangin)\b/],
  ["SHARED", /\b(patungan|urunan|split|bagi|kado|hadiah|ultah|arisan|iuran)\b/],
];

export function suggestCategory(title: string): Category | null {
  const t = title.toLowerCase();
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(t)) return cat;
  return null;
}
