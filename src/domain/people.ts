import { DomainError } from "./errors";

export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeName(name: string): string {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > NAME_MAX) throw new DomainError("INVALID_INPUT", { field: "name" });
  return normalized;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > EMAIL_MAX || !EMAIL_RE.test(normalized))
    throw new DomainError("INVALID_INPUT", { field: "email" });
  return normalized;
}
