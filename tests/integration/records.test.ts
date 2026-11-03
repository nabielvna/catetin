import { describe, expect, it } from "vitest";

import { newId } from "@/lib/server/ids";
import { ctxFor } from "@/services/context";
import { setDebtLabels } from "@/services/labels";
import { recordPayment } from "@/services/payments/mutations";
import { allRecords, openRecords, recentEntries } from "@/services/records";

import { connected, debt, makeUser, manual, obligationRow, record } from "../helpers/factories";

describe("records: home sections & the Records page (D-111)", () => {
  it("unpaid oldest first, latest debts & payments newest first, every record with labels", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const pairId = await connected(andi, budi);
    const dodi = await manual(andi, "Dodi");

    const old = await record(andi, debt(andi, dodi.partyId, 100_000, { title: "Pinjam", occurredOn: "2026-09-02" }));
    const mid = await record(andi, debt(budi, andi, 30_000, { title: "Makan", occurredOn: "2026-09-10" }));
    const pend = await record(andi, debt(andi, budi, 25_000, { title: "Pulsa", occurredOn: "2026-09-20" }));
    const paidOff = await record(andi, debt(andi, dodi.partyId, 8_000, { title: "Kopi", occurredOn: "2026-09-01" }));
    await recordPayment(andi, {
      id: newId(),
      pairId: (await obligationRow(paidOff.id)).pairId,
      payerId: dodi.partyId,
      amount: 8_000,
      currency: "IDR",
      method: "CASH",
      paidOn: "2026-09-03",
    });
    await recordPayment(ctxFor(andi.actor), {
      id: newId(),
      pairId,
      payerId: andi.actor.partyId,
      amount: 10_000,
      currency: "IDR",
      method: "TRANSFER",
      paidOn: "2026-09-27",
    });
    await setDebtLabels(andi, { obligationId: old.id, names: ["kantor"] });

    const open = await openRecords(andi.actor, 5);
    expect(open.total).toBe(2);
    expect(open.rows.map((r) => [r.title, r.direction, r.remaining])).toEqual([
      ["Pinjam", "THEY_OWE", 100_000],
      ["Makan", "I_OWE", 30_000],
    ]);

    const recent = await recentEntries(andi.actor, 5);
    expect(recent[0]).toMatchObject({
      kind: "PAYMENT",
      direction: "OUT",
      counterpartName: "Budi",
      amount: 10_000,
      pendingWith: "THEM",
    });
    expect(recent.map((e) => e.kind).sort()).toEqual(["OBLIGATION", "OBLIGATION", "OBLIGATION", "PAYMENT", "PAYMENT"]);
    expect(recent.find((e) => e.id === pend.id)).toMatchObject({ status: "PENDING", pendingWith: "THEM" });

    const all = await allRecords(andi.actor);
    const by = Object.fromEntries(all.map((r) => [r.title, r]));
    expect(by.Pinjam).toMatchObject({ status: "OPEN", labels: ["kantor"], counterpartName: "Dodi" });
    expect(by.Kopi).toMatchObject({ status: "SETTLED", remaining: 0 });
    expect(by.Pulsa).toMatchObject({ status: "PENDING", pendingWith: "THEM" });
    expect(by.Makan!.id).toBe(mid.id);

    expect((await allRecords(budi.actor)).map((r) => r.title).sort()).toEqual(["Makan", "Pulsa"]);
  });
});
