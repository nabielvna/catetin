import type { Currency, Minor } from "@/domain/money";

export type RecordStatus = "PENDING" | "OPEN" | "SETTLED" | "CLOSED";
export type RecordDirection = "THEY_OWE" | "I_OWE";
export type RecordSort = "oldest" | "newest" | "largest";

export const RECORD_STATUSES: readonly RecordStatus[] = ["PENDING", "OPEN", "SETTLED", "CLOSED"];
export const RECORD_SORTS: readonly RecordSort[] = ["oldest", "newest", "largest"];

export type RecordRow = {
  id: string;
  title: string;
  occurredOn: string;
  dueOn: string | null;
  createdAt: string;
  counterpartId: string;
  counterpartName: string;
  groupId: string | null;
  groupName: string | null;
  amount: Minor;
  remaining: Minor;
  currency: Currency;
  direction: RecordDirection;
  status: RecordStatus;
  pendingWith: "ME" | "THEM" | null;

  category: string | null;
  labels: string[];
};

export type RecordFilter = {
  status: RecordStatus[];
  dir: RecordDirection[];
  people: string[];
  groups: string[];
  labels: string[];
  categories: string[];
  currencies: Currency[];
  sort: RecordSort;
};

export type Facet = "status" | "dir" | "people" | "groups" | "labels" | "categories" | "currencies";

export const DEFAULT_RECORD_FILTER: RecordFilter = {
  status: ["OPEN"],
  dir: [],
  people: [],
  groups: [],
  labels: [],
  categories: [],
  currencies: [],
  sort: "oldest",
};

export function recordStatusOf(status: string, amount: Minor, paid: Minor): RecordStatus {
  if (status === "PENDING") return "PENDING";
  if (status === "ACTIVE") return paid >= amount ? "SETTLED" : "OPEN";
  return "CLOSED";
}

type SearchParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter(Boolean);
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const DIR_PARAM: Record<string, RecordDirection> = { in: "THEY_OWE", out: "I_OWE" };
const STATUS_ALIAS: Record<string, RecordStatus> = {
  ACTIVE: "OPEN",
  UNPAID: "OPEN",
  PAID: "SETTLED",
  REJECTED: "CLOSED",
  CANCELLED: "CLOSED",
  VOID: "CLOSED",
};

export function parseRecordFilter(sp: SearchParams): RecordFilter {
  const rawStatus = list(sp.status).map((s) => s.toUpperCase());

  const known = uniq(
    rawStatus.flatMap((s) => {
      const v = STATUS_ALIAS[s] ?? s;
      return (RECORD_STATUSES as string[]).includes(v) ? [v as RecordStatus] : [];
    }),
  );
  const status = rawStatus.includes("ALL") ? [] : known.length ? known : DEFAULT_RECORD_FILTER.status;
  const sort = list(sp.sort)[0];
  return {
    status,
    dir: uniq(list(sp.dir).flatMap((d) => (DIR_PARAM[d] ? [DIR_PARAM[d]] : []))),
    people: uniq(list(sp.person)),
    groups: uniq(list(sp.group)),
    labels: uniq(list(sp.label)),
    categories: uniq(list(sp.category).map((c) => c.toUpperCase())),
    currencies: uniq(list(sp.currency).map((c) => c.toUpperCase() as Currency)),
    sort: (RECORD_SORTS as string[]).includes(sort ?? "") ? (sort as RecordSort) : DEFAULT_RECORD_FILTER.sort,
  };
}

export function recordFilterQuery(f: RecordFilter): string {
  const p = new URLSearchParams();
  const sameStatus =
    f.status.length === DEFAULT_RECORD_FILTER.status.length &&
    f.status.every((s) => DEFAULT_RECORD_FILTER.status.includes(s));
  if (!sameStatus) {
    if (f.status.length === 0) p.append("status", "all");
    else for (const s of f.status) p.append("status", s.toLowerCase());
  }
  for (const d of f.dir) p.append("dir", d === "THEY_OWE" ? "in" : "out");
  for (const x of f.people) p.append("person", x);
  for (const x of f.groups) p.append("group", x);
  for (const x of f.labels) p.append("label", x);
  for (const x of f.categories) p.append("category", x.toLowerCase());
  for (const x of f.currencies) p.append("currency", x);
  if (f.sort !== DEFAULT_RECORD_FILTER.sort) p.append("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function isDefaultRecordFilter(f: RecordFilter): boolean {
  return recordFilterQuery({ ...f, sort: DEFAULT_RECORD_FILTER.sort }) === "";
}

export const categoryOf = (r: Pick<RecordRow, "category">) => r.category ?? "OTHER";

function matches(r: RecordRow, f: RecordFilter, skip?: Facet): boolean {
  if (skip !== "status" && f.status.length && !f.status.includes(r.status)) return false;
  if (skip !== "dir" && f.dir.length && !f.dir.includes(r.direction)) return false;
  if (skip !== "people" && f.people.length && !f.people.includes(r.counterpartId)) return false;
  if (skip !== "groups" && f.groups.length && !(r.groupId && f.groups.includes(r.groupId))) return false;
  if (skip !== "currencies" && f.currencies.length && !f.currencies.includes(r.currency)) return false;
  if (skip !== "categories" && f.categories.length && !f.categories.includes(categoryOf(r))) return false;
  if (skip !== "labels" && f.labels.length) {
    const mine = r.labels.map((l) => l.toLowerCase());
    if (!f.labels.some((l) => mine.includes(l.toLowerCase()))) return false;
  }
  return true;
}

export function filterRecords(rows: readonly RecordRow[], f: RecordFilter): RecordRow[] {
  return sortRecords(
    rows.filter((r) => matches(r, f)),
    f.sort,
  );
}

export function sortRecords(rows: RecordRow[], sort: RecordSort): RecordRow[] {
  const byDate = (a: RecordRow, b: RecordRow) =>
    a.occurredOn === b.occurredOn ? a.createdAt.localeCompare(b.createdAt) : a.occurredOn.localeCompare(b.occurredOn);
  if (sort === "oldest") return rows.sort(byDate);
  if (sort === "newest") return rows.sort((a, b) => byDate(b, a));
  return rows.sort((a, b) => b.remaining - a.remaining || b.amount - a.amount || byDate(b, a));
}

export type FacetCounts = {
  status: Map<RecordStatus, number>;
  dir: Map<RecordDirection, number>;
  people: Map<string, number>;
  groups: Map<string, number>;
  labels: Map<string, number>;
  categories: Map<string, number>;
  currencies: Map<Currency, number>;
};

export function facetCounts(rows: readonly RecordRow[], f: RecordFilter): FacetCounts {
  const out: FacetCounts = {
    status: new Map(),
    dir: new Map(),
    people: new Map(),
    groups: new Map(),
    labels: new Map(),
    categories: new Map(),
    currencies: new Map(),
  };
  const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of rows) {
    if (matches(r, f, "status")) bump(out.status, r.status);
    if (matches(r, f, "dir")) bump(out.dir, r.direction);
    if (matches(r, f, "people")) bump(out.people, r.counterpartId);
    if (r.groupId && matches(r, f, "groups")) bump(out.groups, r.groupId);
    if (matches(r, f, "currencies")) bump(out.currencies, r.currency);
    if (matches(r, f, "categories")) bump(out.categories, categoryOf(r));
    if (matches(r, f, "labels")) for (const l of new Set(r.labels.map((x) => x.toLowerCase()))) bump(out.labels, l);
  }
  return out;
}

export function openNet(rows: readonly RecordRow[]): Partial<Record<Currency, Minor>> {
  const net: Partial<Record<Currency, Minor>> = {};
  for (const r of rows) {
    if (r.status !== "OPEN") continue;
    net[r.currency] = (net[r.currency] ?? 0) + (r.direction === "THEY_OWE" ? r.remaining : -r.remaining);
  }
  return net;
}
