import type { Minor } from "@/domain/money";

export type Transfer = { from: string; to: string; amount: Minor };

export function netBalances(obligations: ReadonlyArray<{ creditorId: string; debtorId: string; remaining: Minor }>) {
  const net = new Map<string, Minor>();
  for (const o of obligations) {
    if (o.remaining <= 0) continue;
    net.set(o.creditorId, (net.get(o.creditorId) ?? 0) + o.remaining);
    net.set(o.debtorId, (net.get(o.debtorId) ?? 0) - o.remaining);
  }
  return net;
}

export function simplifyTransfers(net: ReadonlyMap<string, Minor>): Transfer[] {
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const byAmount = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || (a.id < b.id ? -1 : 1);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return out;
}

export function currentTransferCount(
  obligations: ReadonlyArray<{ creditorId: string; debtorId: string; remaining: Minor }>,
): number {
  const pairNet = new Map<string, Minor>();
  for (const o of obligations) {
    if (o.remaining <= 0) continue;
    const [a, b] = o.creditorId < o.debtorId ? [o.creditorId, o.debtorId] : [o.debtorId, o.creditorId];
    const key = `${a}|${b}`;
    const sign = o.creditorId === a ? 1 : -1;
    pairNet.set(key, (pairNet.get(key) ?? 0) + sign * o.remaining);
  }
  return [...pairNet.values()].filter((v) => v !== 0).length;
}

export function fingerprint(obligations: ReadonlyArray<{ id: string; remaining: Minor }>): string {
  return [...obligations]
    .filter((o) => o.remaining > 0)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((o) => `${o.id}:${o.remaining}`)
    .join(",");
}
