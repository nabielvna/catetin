import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECORD_FILTER,
  facetCounts,
  filterRecords,
  isDefaultRecordFilter,
  openNet,
  parseRecordFilter,
  recordFilterQuery,
  type RecordRow,
  recordStatusOf,
} from "@/domain/records";

let n = 0;
function row(over: Partial<RecordRow>): RecordRow {
  n += 1;
  return {
    id: `r${n}`,
    title: "Bensin",
    occurredOn: "2026-09-01",
    dueOn: null,
    createdAt: `2026-09-01T00:00:${String(n).padStart(2, "0")}Z`,
    counterpartId: "budi",
    counterpartName: "Budi",
    groupId: null,
    groupName: null,
    amount: 10_000,
    remaining: 10_000,
    currency: "IDR",
    direction: "THEY_OWE",
    status: "OPEN",
    pendingWith: null,
    category: null,
    labels: [],
    ...over,
  };
}

describe("records filter (D-111)", () => {
  it("status from obligation state", () => {
    expect(recordStatusOf("PENDING", 10, 0)).toBe("PENDING");
    expect(recordStatusOf("ACTIVE", 10, 4)).toBe("OPEN");
    expect(recordStatusOf("ACTIVE", 10, 10)).toBe("SETTLED");
    expect(recordStatusOf("VOID", 10, 0)).toBe("CLOSED");
    expect(recordStatusOf("REJECTED", 10, 0)).toBe("CLOSED");
  });

  it("URL round trip; the plain URL is the default (unpaid, oldest first)", () => {
    expect(parseRecordFilter({})).toEqual(DEFAULT_RECORD_FILTER);
    expect(recordFilterQuery(DEFAULT_RECORD_FILTER)).toBe("");
    const f = parseRecordFilter({
      status: ["open", "pending", "bogus"],
      dir: "in",
      person: ["a", "b", "a"],
      label: "kantor",
      category: "food",
      currency: "usd",
      sort: "largest",
    });
    expect(f).toEqual({
      status: ["OPEN", "PENDING"],
      dir: ["THEY_OWE"],
      people: ["a", "b"],
      groups: [],
      labels: ["kantor"],
      categories: ["FOOD"],
      currencies: ["USD"],
      sort: "largest",
    });
    expect(parseRecordFilter(Object.fromEntries(groupParams(recordFilterQuery(f))))).toEqual(f);

    expect(recordFilterQuery({ ...DEFAULT_RECORD_FILTER, status: [] })).toBe("?status=all");
    expect(parseRecordFilter({ status: "all" }).status).toEqual([]);
    expect(parseRecordFilter({ status: ["active", "paid"] }).status).toEqual(["OPEN", "SETTLED"]);
    expect(parseRecordFilter({ status: "nonsense" }).status).toEqual(["OPEN"]);
    expect(isDefaultRecordFilter({ ...DEFAULT_RECORD_FILTER, sort: "newest" })).toBe(true);
    expect(isDefaultRecordFilter({ ...DEFAULT_RECORD_FILTER, dir: ["I_OWE"] })).toBe(false);
  });

  it("filters combine (AND across facets, OR within one), labels case-insensitively", () => {
    const rows = [
      row({ counterpartId: "budi", labels: ["Kantor"] }),
      row({ counterpartId: "citra", direction: "I_OWE" }),
      row({ counterpartId: "budi", status: "SETTLED", remaining: 0 }),
      row({ counterpartId: "dodi", groupId: "kos", groupName: "Kos" }),
    ];
    const base = { ...DEFAULT_RECORD_FILTER };
    expect(filterRecords(rows, base).map((r) => r.counterpartId)).toEqual(["budi", "citra", "dodi"]);
    expect(filterRecords(rows, { ...base, people: ["budi", "citra"], dir: ["THEY_OWE"] })).toHaveLength(1);
    expect(filterRecords(rows, { ...base, status: [], people: ["budi"] })).toHaveLength(2);
    expect(filterRecords(rows, { ...base, labels: ["kantor"] })).toHaveLength(1);
    expect(filterRecords(rows, { ...base, groups: ["kos"] }).map((r) => r.counterpartId)).toEqual(["dodi"]);

    expect(filterRecords(rows, { ...base, categories: ["OTHER"] })).toHaveLength(3);
  });

  it("facet counts ignore their own facet but respect the others", () => {
    const rows = [
      row({ counterpartId: "budi" }),
      row({ counterpartId: "budi", status: "SETTLED", remaining: 0 }),
      row({ counterpartId: "citra", status: "PENDING" }),
    ];
    const c = facetCounts(rows, { ...DEFAULT_RECORD_FILTER, people: ["budi"] });
    expect(Object.fromEntries(c.status)).toEqual({ OPEN: 1, SETTLED: 1 });

    expect(Object.fromEntries(c.people)).toEqual({ budi: 1 });
  });

  it("sorting and the open net per currency", () => {
    const rows = [
      row({ occurredOn: "2026-09-10", remaining: 5_000, amount: 5_000 }),
      row({ occurredOn: "2026-09-02", remaining: 20_000, amount: 20_000, direction: "I_OWE" }),
      row({ occurredOn: "2026-09-05", remaining: 8_000, amount: 8_000, currency: "USD" }),
    ];
    const by = (sort: "oldest" | "newest" | "largest") =>
      filterRecords(rows, { ...DEFAULT_RECORD_FILTER, sort }).map((r) => r.occurredOn.slice(-2));
    expect(by("oldest")).toEqual(["02", "05", "10"]);
    expect(by("newest")).toEqual(["10", "05", "02"]);
    expect(by("largest")).toEqual(["02", "05", "10"]);
    expect(openNet(rows)).toEqual({ IDR: -15_000, USD: 8_000 });
  });
});

function groupParams(q: string): Array<[string, string[]]> {
  const p = new URLSearchParams(q);
  return [...new Set(p.keys())].map((k) => [k, p.getAll(k)]);
}
