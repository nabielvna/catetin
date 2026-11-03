import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { db } from "@/database/client";
import { notification } from "@/database/schema/notifications";
import { newId } from "@/lib/server/ids";
import { dispatchPending } from "@/services/notifications/dispatch";

vi.mock("@/integrations/email/send", () => ({ sendMail: vi.fn() }));

it("defers external email at the daily limit and delivers after the window expires", async () => {
  const now = new Date("2001-01-03T12:00:00Z");
  const email = `${newId()}@example.test`;
  const pendingId = newId();
  const payload = { title: "Reminder", body: "Reminder", url: "/", data: { locale: "en" } };
  for (let i = 0; i < 3; i++) {
    await db
      .insert(notification)
      .values({
        id: newId(),
        dedupeKey: newId(),
        type: "PAYMENT_REMINDER",
        recipientEmail: email,
        channel: "EMAIL",
        payload,
        status: "SENT",
        sentAt: new Date(now.getTime() - 3_600_000),
      });
  }
  await db
    .insert(notification)
    .values({
      id: pendingId,
      dedupeKey: newId(),
      type: "PAYMENT_REMINDER",
      recipientEmail: email,
      channel: "EMAIL",
      payload,
      nextAttemptAt: now,
    });
  await dispatchPending({ now });
  let [row] = await db.select().from(notification).where(eq(notification.id, pendingId));
  expect(row).toMatchObject({ status: "PENDING", attempts: 0, error: null });
  expect(row!.nextAttemptAt.getTime()).toBe(now.getTime() + 12 * 3_600_000);
  await dispatchPending({ now: new Date(now.getTime() + 25 * 3_600_000) });
  [row] = await db.select().from(notification).where(eq(notification.id, pendingId));
  expect(row).toMatchObject({ status: "SENT", attempts: 1, error: null });
});
