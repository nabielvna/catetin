import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/database/client";
import { recurring } from "@/database/schema/debts";
import { todayIn } from "@/domain/dates";
import { CATEGORIES } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import { INSTALLMENTS_MAX, INSTALLMENTS_MIN } from "@/domain/installments";
import { newId } from "@/lib/server/ids";
import { need, reviewOnly, toMinor } from "@/services/assistant/operations/helpers";
import { date, uuid } from "@/services/assistant/operations/schemas";
import { type Env, type Op } from "@/services/assistant/operations/types";
import { forgive } from "@/services/debts/forgive";
import { updateObligation, voidObligation } from "@/services/debts/mutations";
import { type ObligationCore, obligationCore } from "@/services/debts/queries";
import { stopRecurring } from "@/services/debts/recurring";
import { attachFile, uploadImage } from "@/services/files";

export const manageDebtInput = z.object({
  action: z
    .enum(["EDIT", "DELETE", "FORGIVE", "SET_LABELS", "STOP_REPEAT", "ATTACH_PHOTO"])
    .describe(
      "EDIT edit a debt; DELETE delete/void; FORGIVE forgive (lender only); SET_LABELS private labels; STOP_REPEAT stop a recurring debt; ATTACH_PHOTO attach the latest photo in the chat as proof",
    ),
  debtId: uuid.optional().describe("debt id (from listDebts/getDetail); required except for STOP_REPEAT"),
  repeatId: uuid.optional().describe("recurring debt id (getDetail PERSON → recurring); for STOP_REPEAT"),
  amount: z
    .number()
    .positive()
    .optional()
    .describe("EDIT: new amount; FORGIVE: amount forgiven (empty = all remaining)"),
  title: z.string().min(1).max(100).optional(),
  note: z.string().max(1000).optional(),
  category: z.enum(CATEGORIES).optional(),
  occurredOn: date.optional(),
  dueOn: date.optional(),
  clearDueOn: z.boolean().optional().describe("true = remove the due date"),
  installments: z
    .object({
      count: z.number().int().min(INSTALLMENTS_MIN).max(INSTALLMENTS_MAX),
      every: z.enum(["WEEK", "MONTH"]),
      firstDue: date,
    })
    .optional()
    .describe("EDIT: turn into installments"),
  clearInstallments: z.boolean().optional().describe("true = remove installments (becomes a single payment)"),
  labels: z.array(z.string().min(1).max(30)).max(10).optional().describe("SET_LABELS: the complete new label list"),
  reason: z.string().max(500).optional().describe("DELETE: reason (optional)"),
});
export type ManageDebtInput = z.infer<typeof manageDebtInput>;

async function core(env: Env, id: string | undefined): Promise<ObligationCore> {
  const o = await obligationCore(env.actor, need(id, "debtId"));
  if (!o || o.status === "VOID" || o.status === "REJECTED") throw new DomainError("NOT_FOUND", { field: "debtId" });
  return o;
}

function debtLine(o: ObligationCore, env: Env) {
  const who = o.iAmCreditor
    ? env.t("theyOweYou", { name: o.counterpart.name })
    : o.iAmDebtor
      ? env.t("youOweThem", { name: o.counterpart.name })
      : `${o.debtorName} → ${o.creditorName}`;
  return `${o.title} · ${env.fmt(o.amount, o.currency)} · ${who}`;
}

function patchOf(i: ManageDebtInput, o: ObligationCore) {
  const patch: Parameters<typeof updateObligation>[1]["patch"] = {};
  if (i.amount !== undefined) patch.amount = toMinor(i.amount, o.currency);
  if (i.title !== undefined) patch.title = i.title;
  if (i.note !== undefined) patch.note = i.note || null;
  if (i.category !== undefined) patch.category = i.category;
  if (i.occurredOn !== undefined) patch.occurredOn = i.occurredOn;
  if (i.clearDueOn) patch.dueOn = null;
  else if (i.dueOn !== undefined) patch.dueOn = i.dueOn;
  if (i.clearInstallments) patch.installments = null;
  else if (i.installments) patch.installments = i.installments;
  return patch;
}

export const manageDebt: Op<ManageDebtInput> = {
  review(i) {
    if (!i.debtId) return null;
    if (i.action === "EDIT" && !i.installments && !i.clearInstallments)
      return { form: `/debts/${i.debtId}/edit`, view: `/debts/${i.debtId}` };
    if (i.action === "SET_LABELS") return { form: `/debts/${i.debtId}`, view: `/debts/${i.debtId}` };
    return null;
  },

  async preview(i, env) {
    const { t } = env;
    if (i.action === "STOP_REPEAT") {
      const [r] = await db
        .select()
        .from(recurring)
        .where(eq(recurring.id, need(i.repeatId, "repeatId")));
      const me = env.actor.partyId;
      if (!r || (r.creditorId !== me && r.debtorId !== me)) throw new DomainError("NOT_FOUND", { field: "repeatId" });
      if (r.status !== "ACTIVE" && r.status !== "PENDING") throw new DomainError("INVALID_STATE");
      return {
        title: t("debt.stopRepeat"),
        lines: [`${r.title} · ${env.fmt(Number(r.amount), r.currency)} · ${t(`every.${r.every}`)}`],
        danger: t("debt.stopRepeatDanger"),
        confirm: t("confirm.stop"),
      };
    }
    const o = await core(env, i.debtId);
    const line = debtLine(o, env);
    switch (i.action) {
      case "EDIT": {
        const p = patchOf(i, o);
        const lines: string[] = [line];
        if (p.amount !== undefined) lines.push(`${t("field.amount")}: ${env.fmt(p.amount, o.currency)}`);
        if (p.title !== undefined) lines.push(`${t("field.title")}: ${p.title}`);
        if (p.category !== undefined) lines.push(`${t("field.category")}: ${p.category}`);
        if (p.occurredOn !== undefined) lines.push(`${t("field.date")}: ${p.occurredOn}`);
        if (p.dueOn !== undefined) lines.push(`${t("field.due")}: ${p.dueOn ?? "–"}`);
        if (p.installments !== undefined)
          lines.push(
            `${t("field.installments")}: ${p.installments ? t("installmentPlan", { count: p.installments.count, every: t(`every.${p.installments.every}`) }) : "–"}`,
          );
        if (p.note !== undefined) lines.push(`${t("field.note")}: ${p.note ?? "–"}`);
        if (lines.length === 1) throw new DomainError("INVALID_INPUT", { reason: "nothing to change" });
        return { title: t("debt.edit"), lines, confirm: t("confirm.save") };
      }
      case "DELETE":
        return {
          title: t("debt.delete"),
          lines: [line, ...(i.reason ? [`${t("field.reason")}: ${i.reason}`] : [])],
          danger: t("debt.deleteDanger"),
          confirm: t("confirm.delete"),
        };
      case "FORGIVE": {
        if (!o.iAmCreditor) throw new DomainError("FORBIDDEN_ROLE", { reason: "only the lender can forgive" });
        const left = o.amount - o.paid;
        const amount = i.amount !== undefined ? toMinor(i.amount, o.currency) : left;
        return {
          title: t("debt.forgive"),
          lines: [line, `${t("field.forgiven")}: ${env.fmt(amount, o.currency)}`],
          danger: t("debt.forgiveDanger", { name: o.counterpart.name }),
          confirm: t("confirm.forgive"),
        };
      }
      case "SET_LABELS": {
        const labels = need(i.labels, "labels");
        return {
          title: t("debt.labels"),
          lines: [line, labels.length ? labels.map((l) => `#${l}`).join(" ") : "–"],
          confirm: t("confirm.save"),
        };
      }
      case "ATTACH_PHOTO": {
        if (!env.images().length)
          throw new DomainError("INVALID_INPUT", { field: "photo", reason: "no photo in chat" });
        return { title: t("debt.attach"), lines: [line], confirm: t("confirm.attach") };
      }
    }
  },

  async run(i, ctx, env) {
    const { t } = env;
    if (i.action === "STOP_REPEAT") {
      await stopRecurring(ctx, { id: need(i.repeatId, "repeatId") });
      return { summary: t("done.stopped") };
    }
    const o = await core(env, i.debtId);
    const href = `/debts/${o.id}`;
    switch (i.action) {
      case "EDIT": {
        const r = await updateObligation(ctx, { id: o.id, patch: patchOf(i, o) });
        return { summary: t(r.status === "PROPOSED" ? "done.proposed" : "done.saved"), status: r.status, href };
      }
      case "DELETE": {
        const r = await voidObligation(ctx, { id: o.id, reason: i.reason ?? null });
        return { summary: t(r.status === "PROPOSED" ? "done.proposed" : "done.deleted"), status: r.status };
      }
      case "FORGIVE": {
        const r = await forgive(ctx, {
          id: newId(),
          obligationId: o.id,
          amount: i.amount !== undefined ? toMinor(i.amount, o.currency) : null,
          paidOn: todayIn(ctx.actor.timezone, ctx.now),
        });
        return { summary: t(r.status === "PENDING" ? "done.proposed" : "done.forgiven"), status: r.status, href };
      }
      case "ATTACH_PHOTO": {
        const img = env.images().at(-1);
        if (!img) throw new DomainError("INVALID_INPUT", { field: "photo" });
        const { id: fileId } = await uploadImage(ctx.actor, img);
        await attachFile(ctx, { fileId, target: { type: "OBLIGATION", id: o.id } });
        return { summary: t("done.attached"), href };
      }
    }
    return reviewOnly();
  },
};
