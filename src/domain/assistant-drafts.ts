import { type Currency, fromMajor } from "@/domain/money";
export type Directory = {
  me: { partyId: string; name: string; currency: Currency };
  people: Array<{ id: string; name: string; state: string }>;
  groups: Array<{ id: string; name: string }>;
};

export type Ref = "me" | { partyId?: string; newPersonName?: string };

export type BillInput = {
  title: string;
  currency?: Currency;
  payer: Ref;
  participants: Ref[];
  mode: "EQUAL" | "ITEMS" | "EXACT" | "SHARES";
  subtotal?: number;
  items?: Array<{ name: string; amount: number; assignees?: string[] }>;
  exact?: Array<{ who: string; amount: number }>;
  shares?: Array<{ who: string; shares: number }>;
  serviceBps?: number;
  taxBps?: number;
  serviceAmount?: number;
  taxAmount?: number;
  discount?: number;
  groupId?: string;
  occurredOn?: string;
  dueOn?: string;
  attachPhoto?: boolean;
};

export function resolveBill(input: BillInput, dir: Directory, newId: (name: string) => string) {
  const currency = input.currency ?? dir.me.currency;
  const newPeople: Array<{ id: string; name: string }> = [];
  const toId = (r: Ref | string): string | null => {
    if (r === "me") return dir.me.partyId;
    if (typeof r === "string") {
      if (r.startsWith("new:")) return toId({ newPersonName: r.slice(4) });
      return dir.people.some((p) => p.id === r) ? r : null;
    }
    if (r.partyId) return r.partyId;
    if (r.newPersonName) {
      const name = r.newPersonName.trim();
      const nid = newId(name.toLowerCase());
      if (!newPeople.some((p) => p.id === nid)) newPeople.push({ id: nid, name });
      return nid;
    }
    return null;
  };
  const participants = [...new Set(input.participants.map(toId).filter((x): x is string => !!x))];
  const payerId = toId(input.payer);
  const items = (input.items ?? []).map((it, i) => ({
    id: String(i),
    name: it.name,
    amount: fromMajor(it.amount, currency),
    assignees: it.assignees?.length ? it.assignees.map(toId).filter((x): x is string => !!x) : participants,
  }));
  const byPerson = <T>(list: Array<{ who: string } & T> | undefined, pick: (x: T) => number) => {
    if (!list?.length) return undefined;
    const out: Record<string, number> = {};
    for (const x of list) {
      const pid = toId(x.who);
      if (pid) out[pid] = (out[pid] ?? 0) + pick(x);
    }
    return out;
  };
  const exact = byPerson<{ amount: number }>(input.exact, (x) => fromMajor(x.amount, currency));
  const shares = byPerson<{ shares: number }>(input.shares, (x) => x.shares);
  const mode: "EQUAL" | "ITEMS" | "EXACT" | "SHARES" =
    input.mode === "ITEMS" && items.length
      ? "ITEMS"
      : input.mode === "EXACT" && exact
        ? "EXACT"
        : input.mode === "SHARES" && shares
          ? "SHARES"
          : "EQUAL";
  return { currency, participants, payerId, items, newPeople, exact, shares, mode };
}
