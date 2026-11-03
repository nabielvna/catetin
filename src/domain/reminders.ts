import { diffDays, type LocalDate } from "@/domain/dates";

export const REMINDER_HOUR = 9;
export const OVERDUE_EVERY_DAYS = 3;
export const OVERDUE_MAX_DAYS = 30;

export type ReminderKind = "DUE_IN_3" | "DUE_IN_1" | "DUE_TODAY" | "OVERDUE";
export type ReminderRole = "DEBTOR" | "CREDITOR";

export type ReminderPlan = { kind: ReminderKind; daysOverdue: number };

export function reminderFor(dueOn: LocalDate, today: LocalDate, role: ReminderRole): ReminderPlan | null {
  const daysUntil = diffDays(today, dueOn);
  if (role === "DEBTOR") {
    if (daysUntil === 3) return { kind: "DUE_IN_3", daysOverdue: 0 };
    if (daysUntil === 1) return { kind: "DUE_IN_1", daysOverdue: 0 };
  }
  if (daysUntil === 0) return { kind: "DUE_TODAY", daysOverdue: 0 };
  if (daysUntil < 0) {
    const overdue = -daysUntil;
    if (overdue % OVERDUE_EVERY_DAYS !== 0 || overdue > OVERDUE_MAX_DAYS) return null;
    if (role === "CREDITOR" && overdue !== OVERDUE_EVERY_DAYS) return null;
    return { kind: "OVERDUE", daysOverdue: overdue };
  }
  return null;
}

export type QuietHours = { start: number; end: number };

export const DEFAULT_QUIET_HOURS: QuietHours = { start: 21, end: 8 };

export function isQuietHour(hour: number, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  if (quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? hour >= quiet.start && hour < quiet.end : hour >= quiet.start || hour < quiet.end;
}

export function hoursUntilQuietEnds(hour: number, quiet: QuietHours = DEFAULT_QUIET_HOURS): number {
  if (!isQuietHour(hour, quiet)) return 0;
  return (quiet.end - hour + 24) % 24;
}
