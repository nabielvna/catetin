import { and, eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { notification } from "@/database/schema/notifications";
import { runDueReminders } from "@/jobs/reminders";

import { connected, debt, makeUser, manual, record } from "../helpers/factories";

const nineAmJakarta = (date: string) => new Date(`${date}T02:00:00Z`);

describe("due-date reminders", () => {
  it("debtor gets D-1, creditor gets the due day; re-running doesn't duplicate", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const d = await record(budi, debt(andi, budi, 50_000, { dueOn: "2026-10-10" }));

    await runDueReminders(nineAmJakarta("2026-10-09"));
    await runDueReminders(nineAmJakarta("2026-10-09"));
    const h1 = await db
      .select()
      .from(notification)
      .where(and(like(notification.dedupeKey, `due:${d.id}:%`), eq(notification.channel, "INBOX")));
    expect(h1.map((n) => `${n.type}:${n.recipientUserId === budi.actor.userId ? "B" : "A"}`)).toEqual(["DUE_IN_1:B"]);

    await runDueReminders(nineAmJakarta("2026-10-10"));
    const all = await db
      .select()
      .from(notification)
      .where(and(like(notification.dedupeKey, `due:${d.id}:%`), eq(notification.channel, "INBOX")));
    expect(all.map((n) => n.type).sort()).toEqual(["DUE_IN_1", "DUE_TODAY", "DUE_TODAY"]);
  });

  it("outside the reminder hour nothing happens", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const d = await record(budi, debt(andi, budi, 1_000, { dueOn: "2026-10-10" }));
    await runDueReminders(new Date("2026-10-10T10:00:00Z"));
    const rows = await db
      .select()
      .from(notification)
      .where(like(notification.dedupeKey, `due:${d.id}:%`));
    expect(rows).toHaveLength(0);
  });

  it("a manual contact with an email gets an email on the due day", async () => {
    const andi = await makeUser("Andi");
    const { partyId } = await manual(andi, "Dodi", "dodi@example.com");
    const d = await record(andi, debt(andi, partyId, 20_000, { dueOn: "2026-10-10" }));
    await runDueReminders(nineAmJakarta("2026-10-10"));
    const rows = await db
      .select()
      .from(notification)
      .where(like(notification.dedupeKey, `due:${d.id}:%:EXT`));
    expect(rows[0]?.recipientEmail).toBe("dodi@example.com");
  });
});
