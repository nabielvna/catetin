export const ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN_ROLE",
  "INVALID_STATE",
  "ALREADY_DECIDED",
  "CHANGE_PENDING",
  "SUPERSEDED",
  "OVERPAY",
  "AMOUNT_BELOW_PAID",
  "MIXED_CHANGE",
  "CURRENCY_CHANGE",
  "ITEMS_MISMATCH",
  "HAS_PAYMENTS",
  "HAS_RECORDS",
  "NOT_SETTLED",
  "CURRENCY_MISMATCH",
  "INVALID_RATE",
  "NOTHING_TO_OFFSET",
  "SPLIT_INVALID",
  "SELF_PAIR",
  "BLOCKED",
  "INVITE_INVALID",
  "SELF_INVITE",
  "NOT_GROUP_MEMBER",
  "GROUP_BALANCE_NOT_ZERO",
  "LAST_ADMIN",
  "RATE_LIMITED",
  "FILE_REJECTED",
  "UNAUTHENTICATED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly params: Record<string, string | number> | undefined;

  constructor(code: ErrorCode, params?: Record<string, string | number>) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.params = params;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export function assert(
  condition: unknown,
  code: ErrorCode,
  params?: Record<string, string | number>,
): asserts condition {
  if (!condition) throw new DomainError(code, params);
}
