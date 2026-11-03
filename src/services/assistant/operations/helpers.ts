import "server-only";

import { createTranslator } from "next-intl";

import { DomainError, type ErrorCode, isDomainError } from "@/domain/errors";
import { type Currency, currencyExponent } from "@/domain/money";
import { messagesFor } from "@/i18n/messages";
import { money } from "@/lib/format";
import type { Contact } from "@/services/assistant/context";
import type { Env } from "@/services/assistant/operations/types";
import type { OpFail } from "@/services/assistant/operations/types";
import type { Actor } from "@/services/context";

export function reviewOnly(): never {
  throw new DomainError("INVALID_INPUT", { reason: "saved through the form" });
}

export function makeEnv(actor: Actor, contacts: Contact[], images: () => Buffer[] = () => []): Env {
  const t = createTranslator({
    locale: actor.locale,
    messages: messagesFor(actor.locale).assistant.ops,
  }) as unknown as Env["t"];
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  return {
    actor,
    contacts,
    t,
    fmt: (minor, currency) => money(minor, currency, actor.locale),
    nameOf: (id) => (id === actor.partyId ? actor.name : (names.get(id) ?? "?")),
    images,
  };
}

export function errorOutput(e: unknown, locale: string): OpFail {
  const code: ErrorCode = isDomainError(e) ? e.code : "INTERNAL";
  const te = createTranslator({ locale, messages: messagesFor(locale), namespace: "errors" }) as unknown as (
    k: string,
  ) => string;

  const params = isDomainError(e) && e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : "";
  return { ok: false, code, message: `${te(code)}${params}` };
}

export function toMinor(amount: number, currency: Currency | string): number {
  return Math.round(amount * 10 ** currencyExponent(currency as Currency));
}

export function need<T>(v: T | undefined | null, field: string): T {
  if (v === undefined || v === null || v === "") {
    throw new DomainError("INVALID_INPUT", { field, reason: "required" });
  }
  return v;
}
