import { describe, expect, it } from "vitest";

import { todayIn } from "@/domain/dates";
import { computePersonStats, computeStats } from "@/domain/stats";
import { newId } from "@/lib/server/ids";
import { decideRequest } from "@/services/approvals/decisions";
import { contactsFor } from "@/services/assistant/context";
import { serverTools } from "@/services/assistant/tools";
import { ctxFor } from "@/services/context";
import { recordPayment } from "@/services/payments/mutations";
import { remindPerson } from "@/services/people/remind";
import { statsInput } from "@/services/stats";

import { connected, debt, makeUser, manual, obligationRow, pendingFor, record } from "../helpers/factories";

describe("statistics data (D-112)", () => {
  it("settle date, reminders and approval timings come from the real records", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const pairId = await connected(andi, budi);
    const today = todayIn(andi.actor.timezone, new Date());

    const d = await record(andi, debt(andi, budi, 40_000, { title: "Makan", category: "FOOD", occurredOn: today }));
    await decideRequest(ctxFor(budi.actor), { requestId: (await pendingFor(budi, d.id))!, decision: "APPROVE" });
    await remindPerson(ctxFor(andi.actor), { partyId: budi.actor.partyId });
    const p = await recordPayment(ctxFor(budi.actor), {
      id: newId(),
      pairId,
      payerId: budi.actor.partyId,
      amount: 40_000,
      currency: "IDR",
      method: "TRANSFER",
      paidOn: today,
    });
    await decideRequest(ctxFor(andi.actor), { requestId: (await pendingFor(andi, p.id))!, decision: "APPROVE" });
    expect((await obligationRow(d.id)).paid).toBe(40_000);

    const input = await statsInput(andi.actor);
    expect(input.obligations).toHaveLength(1);
    expect(input.obligations[0]).toMatchObject({ direction: "THEY_OWE", category: "FOOD", settledOn: today });
    expect(input.reminders).toEqual([{ pairId, byMe: true, on: today }]);
    expect(input.votes.map((v) => v.byMe).sort()).toEqual([false, true]);
    expect(input.settlements).toMatchObject([{ kind: "PAYMENT", direction: "IN", method: "TRANSFER", amount: 40_000 }]);

    const s = computeStats(input, { period: "month", currency: "IDR", today });
    expect(s.summary).toMatchObject({ lent: 40_000, lentCount: 1, received: 40_000 });
    expect(s.habits.them).toMatchObject({ settledCount: 1, medianDays: 0, remindersAvg: 1, openCount: 0 });
    expect(s.habits.them.confirmMinutes).not.toBeNull();
    expect(s.categories.map((c) => [c.key, c.top?.name])).toEqual([["FOOD", "Budi"]]);

    const b = computePersonStats(await statsInput(budi.actor), andi.actor.partyId, {
      period: "all",
      currency: "IDR",
      today,
    });
    expect(b.summary).toMatchObject({ borrowed: 40_000, borrowedCount: 1, paid: 40_000 });
    expect(b.habits.me).toMatchObject({ settledCount: 1, favoriteMethod: { method: "TRANSFER", share: 100 } });
  });

  it("assistant: getStats answers patterns, listDebts filters like the Records page", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const dodi = await manual(andi, "Dodi");
    const today = todayIn(andi.actor.timezone, new Date());
    await record(andi, debt(andi, dodi.partyId, 20_000, { title: "Bensin", category: "TRANSPORT", occurredOn: today }));
    await record(andi, debt(budi, andi, 15_000, { title: "Makan", category: "FOOD", occurredOn: today }));
    const tools = serverTools(andi.actor, await contactsFor(andi.actor));
    const call = async (name: "getStats" | "listDebts", input: Record<string, unknown>) =>
      (await tools[name].execute!(input as never, { toolCallId: "t", messages: [] } as never)) as Record<
        string,
        unknown
      >;

    const all = await call("getStats", { period: "month" });
    expect(all.summary).toMatchObject({ lent: 20_000, borrowed: 15_000 });
    expect(all.page).toBe("/stats");
    const one = await call("getStats", { period: "all", partyId: dodi.partyId });
    expect(one).toMatchObject({ summary: { lent: 20_000, borrowed: 0 }, page: `/people/${dodi.partyId}/stats` });
    expect(one.theyBorrowedFor).toEqual([
      { key: "TRANSPORT", name: "Transport", amount: 20_000, count: 1, mostOften: "Dodi" },
    ]);

    const owe = (await call("listDebts", { kind: "debts", status: "active", direction: "i_owe" })) as {
      items: Array<{ title: string; person: string }>;
    };
    expect(owe.items.map((i) => [i.title, i.person])).toEqual([["Makan", "Budi"]]);
    const food = (await call("listDebts", { kind: "debts", status: "all", category: "TRANSPORT" })) as {
      count: number;
    };
    expect(food.count).toBe(1);
  });
});
