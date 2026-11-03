import { addDays, isLocalDate, type LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { addPeriods } from "@/domain/installments";

export const RECURRING_PERIODS = ["WEEK", "MONTH", "YEAR"] as const;
export type RecurringPeriod = (typeof RECURRING_PERIODS)[number];
export const DUE_AFTER_MAX = 90;

export const CATCH_UP_MAX = 3;

// Anchor every occurrence to the start date so the 31st recovers after February.
export function occurrenceOn(startOn: LocalDate, every: RecurringPeriod, n: number): LocalDate {
  return addPeriods(startOn, every, n);
}

export function assertValidRecurring(input: {
  every: string;
  startOn: string;
  dueAfterDays?: number | null;
}): asserts input is { every: RecurringPeriod; startOn: LocalDate; dueAfterDays?: number | null } {
  if (!(RECURRING_PERIODS as readonly string[]).includes(input.every)) {
    throw new DomainError("INVALID_INPUT", { field: "every" });
  }
  if (!isLocalDate(input.startOn)) throw new DomainError("INVALID_INPUT", { field: "startOn" });
  const d = input.dueAfterDays;
  if (d !== null && d !== undefined && (!Number.isInteger(d) || d < 0 || d > DUE_AFTER_MAX)) {
    throw new DomainError("INVALID_INPUT", { field: "dueAfterDays" });
  }
}

export function dueFor(occurrence: LocalDate, dueAfterDays: number | null | undefined): LocalDate | null {
  return dueAfterDays === null || dueAfterDays === undefined ? null : addDays(occurrence, dueAfterDays);
}

export function dueOccurrences(
  startOn: LocalDate,
  every: RecurringPeriod,
  from: number,
  today: LocalDate,
): { indexes: number[]; next: number } {
  const all: number[] = [];
  let n = from;
  while (occurrenceOn(startOn, every, n) <= today && all.length < 1000) all.push(n++);
  return { indexes: all.slice(-CATCH_UP_MAX), next: n };
}
