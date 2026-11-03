import { isLocalDate } from "@/domain/dates";
import { NOTE_MAX } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import { assertValidAmount, isCurrency, type Minor } from "@/domain/money";

export type PaymentMethod = "CASH" | "TRANSFER" | "EWALLET" | "OTHER";

export function assertCommon(input: { amount: Minor; currency: string; paidOn: string; note?: string | null }) {
  assertValidAmount(input.amount);
  if (!isCurrency(input.currency)) throw new DomainError("INVALID_INPUT", { field: "currency" });
  if (!isLocalDate(input.paidOn)) throw new DomainError("INVALID_INPUT", { field: "paidOn" });
  if (input.note && input.note.length > NOTE_MAX) throw new DomainError("INVALID_INPUT", { field: "note" });
}
