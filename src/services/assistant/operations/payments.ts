import "server-only";

import { z } from "zod";

import { db } from "@/database/client";
import { todayIn } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { newId } from "@/lib/server/ids";
import { need, toMinor } from "@/services/assistant/operations/helpers";
import { currencyCode, uuid } from "@/services/assistant/operations/schemas";
import { type Env, type Op } from "@/services/assistant/operations/types";
import { latestRate } from "@/services/currencies";
import { attachFile, uploadImage } from "@/services/files";
import { voidSettlement } from "@/services/payments/mutations";
import { offsetPreview, proposeOffset } from "@/services/payments/offsets";
import { type SettlementCore, settlementCore } from "@/services/payments/queries";
import { findPair } from "@/services/people/parties";

export const managePaymentInput = z.object({
  action: z
    .enum(["CANCEL", "OFFSET", "ATTACH_PHOTO"])
    .describe(
      "CANCEL cancel a payment; OFFSET offset debts with one person (my debt to them is reduced by their debt to me); ATTACH_PHOTO attach the latest photo in the chat to the payment",
    ),
  paymentId: uuid.optional().describe("payment id (from listDebts kind=payments / getDetail); CANCEL & ATTACH_PHOTO"),
  partyId: uuid.optional().describe("OFFSET: orangnya"),
  amount: z.number().positive().optional().describe("OFFSET: amount offset (empty = as much as possible)"),
  currency: currencyCode.optional().describe("OFFSET: currency of my debt to them"),
  theirCurrency: currencyCode
    .optional()
    .describe("OFFSET: currency of their debt to me, if different (latest rate used)"),
  reason: z.string().max(500).optional().describe("CANCEL: reason (optional)"),
});
export type ManagePaymentInput = z.infer<typeof managePaymentInput>;

async function core(env: Env, id: string | undefined): Promise<SettlementCore> {
  const s = await settlementCore(env.actor, need(id, "paymentId"));
  if (!s) throw new DomainError("NOT_FOUND", { field: "paymentId" });
  return s;
}

function paymentLine(s: SettlementCore, env: Env) {
  const dir = s.iAmPayer
    ? env.t("paidTo", { name: s.counterpart.name })
    : env.t("paidBy", { name: s.counterpart.name });
  return `${env.fmt(s.amount, s.currency)} · ${dir} · ${s.paidOn}`;
}

async function offsetPlan(i: ManagePaymentInput, env: Env) {
  const partyId = need(i.partyId, "partyId");
  const pair = await findPair(db, env.actor.partyId, partyId);
  if (!pair) throw new DomainError("NOT_FOUND", { field: "partyId" });
  const currency = (i.currency ?? env.actor.currency) as Currency;
  const theirs = (i.theirCurrency ?? currency) as Currency;
  let rate: string | null = null;
  if (theirs !== currency) {
    rate = await latestRate(currency, theirs);
    if (!rate) throw new DomainError("INVALID_RATE");
  }
  let amount = i.amount !== undefined ? toMinor(i.amount, currency) : null;
  if (amount === null) {
    if (theirs !== currency)
      throw new DomainError("INVALID_INPUT", { field: "amount", reason: "required for cross-currency" });
    const max = (await offsetPreview(db, pair.id, env.actor.partyId, partyId)).find((x) => x.currency === currency);
    if (!max) throw new DomainError("NOTHING_TO_OFFSET");
    amount = max.max;
  }
  return { pairId: pair.id, partyId, currency, theirs, rate, amount };
}

export const managePayment: Op<ManagePaymentInput> = {
  review(i, env) {
    if (i.action !== "OFFSET" || !i.partyId) return null;
    const currency = i.currency ?? env.actor.currency;
    if (i.theirCurrency && i.theirCurrency !== currency) return null;
    return { form: `/payments/new?with=${i.partyId}&kind=offset&currency=${currency}`, view: `/people/${i.partyId}` };
  },

  async preview(i, env) {
    const { t } = env;
    if (i.action === "OFFSET") {
      const p = await offsetPlan(i, env);
      const lines = [
        t("offsetLine", { name: env.nameOf(p.partyId), amount: env.fmt(p.amount, p.currency) }),
        ...(p.rate ? [t("rateLine", { from: p.currency, to: p.theirs, rate: p.rate })] : []),
      ];
      return { title: t("payment.offset"), lines, confirm: t("confirm.save") };
    }
    const s = await core(env, i.paymentId);
    if (i.action === "CANCEL") {
      return {
        title: t("payment.cancel"),
        lines: [paymentLine(s, env), ...(i.reason ? [`${t("field.reason")}: ${i.reason}`] : [])],
        danger: t("payment.cancelDanger"),
        confirm: t("confirm.cancelPayment"),
      };
    }
    if (!env.images().length) throw new DomainError("INVALID_INPUT", { field: "photo", reason: "no photo in chat" });
    return { title: t("payment.attach"), lines: [paymentLine(s, env)], confirm: t("confirm.attach") };
  },

  async run(i, ctx, env) {
    const { t } = env;
    if (i.action === "OFFSET") {
      const p = await offsetPlan(i, env);
      const r = await proposeOffset(ctx, {
        id: newId(),
        pairId: p.pairId,
        amount: p.amount,
        currency: p.currency,
        counterCurrency: p.theirs !== p.currency ? p.theirs : null,
        rate: p.rate,
        paidOn: todayIn(ctx.actor.timezone, ctx.now),
      });
      return {
        summary: t(r.status === "PENDING" ? "done.proposed" : "done.saved"),
        status: r.status,
        href: `/payments/${r.id}`,
      };
    }
    const s = await core(env, i.paymentId);
    if (i.action === "CANCEL") {
      const r = await voidSettlement(ctx, { id: s.id, reason: i.reason ?? null });
      return { summary: t(r.status === "PROPOSED" ? "done.proposed" : "done.cancelled"), status: r.status };
    }
    const img = env.images().at(-1);
    if (!img) throw new DomainError("INVALID_INPUT", { field: "photo" });
    const { id: fileId } = await uploadImage(ctx.actor, img);
    await attachFile(ctx, { fileId, target: { type: "SETTLEMENT", id: s.id } });
    return { summary: t("done.attached"), href: `/payments/${s.id}` };
  },
};
