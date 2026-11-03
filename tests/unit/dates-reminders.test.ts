import { describe, expect, it } from "vitest";

import { addDays, diffDays, endOfMonth, hourIn, isLocalDate, todayIn } from "@/domain/dates";
import { hoursUntilQuietEnds, isQuietHour, reminderFor } from "@/domain/reminders";

describe("dates", () => {
  it("today follows the user's time zone", () => {
    const now = new Date("2026-09-27T20:00:00Z");
    expect(todayIn("Asia/Jakarta", now)).toBe("2026-09-28");
    expect(todayIn("America/New_York", now)).toBe("2026-09-27");
    expect(hourIn("Asia/Jakarta", now)).toBe(3);
  });

  it("date arithmetic across months & years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2026-02-27", "2026-03-01")).toBe(2);
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("date validation", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-9-1")).toBe(false);
  });
});

describe("reminder schedule", () => {
  const due = "2026-10-10";
  it.each([
    ["2026-10-07", "DUE_IN_3"],
    ["2026-10-08", null],
    ["2026-10-09", "DUE_IN_1"],
    ["2026-10-10", "DUE_TODAY"],
    ["2026-10-11", null],
    ["2026-10-13", "OVERDUE"],
    ["2026-10-16", "OVERDUE"],
    ["2026-11-09", "OVERDUE"],
    ["2026-11-12", null],
  ])("debitur %s → %s", (today, kind) => {
    expect(reminderFor(due, today, "DEBTOR")?.kind ?? null).toBe(kind);
  });

  it.each([
    ["2026-10-07", null],
    ["2026-10-10", "DUE_TODAY"],
    ["2026-10-13", "OVERDUE"],
    ["2026-10-16", null],
  ])("kreditur %s → %s", (today, kind) => {
    expect(reminderFor(due, today, "CREDITOR")?.kind ?? null).toBe(kind);
  });

  it("quiet hours 21–08", () => {
    expect(isQuietHour(22)).toBe(true);
    expect(isQuietHour(7)).toBe(true);
    expect(isQuietHour(8)).toBe(false);
    expect(hoursUntilQuietEnds(22)).toBe(10);
    expect(hoursUntilQuietEnds(12)).toBe(0);
  });
});
