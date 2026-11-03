"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { CATEGORIES } from "@/domain/debt";
import { INSTALLMENTS_MAX, INSTALLMENTS_MIN } from "@/domain/installments";
import { CURRENCIES } from "@/domain/money";
import { DUE_AFTER_MAX } from "@/domain/recurring";
import { newId } from "@/lib/server/ids";
import { guessCategory } from "@/services/categories";
import { forgive } from "@/services/debts/forgive";
import { createObligation, updateObligation, voidObligation } from "@/services/debts/mutations";
import { createRecurring, stopRecurring } from "@/services/debts/recurring";
import { setDebtLabels } from "@/services/labels";
import { createManualContact } from "@/services/people/mutations";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.number().int().positive().max(1_000_000_000_000);
const installments = z.object({
  count: z.number().int().min(INSTALLMENTS_MIN).max(INSTALLMENTS_MAX),
  every: z.enum(["WEEK", "MONTH"]),
  firstDue: date,
});
const labels = z.array(z.string().min(1).max(31)).max(10);
const item = z.object({
  name: z.string().min(1).max(100),
  qtyMilli: z.number().int().positive().max(1_000_000_000),
  unitPrice: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
});

export const recordDebt = action(
  z.object({
    id: uuid,

    counterpartId: uuid.nullable(),
    newPerson: z.object({ id: uuid, name: z.string().min(1).max(60) }).nullable(),
    direction: z.enum(["THEY_OWE", "I_OWE"]),
    amount,
    currency: z.enum(CURRENCIES),
    title: z.string().min(1).max(100),
    note: z.string().max(1000).nullish(),
    category: z.enum(CATEGORIES).nullish(),
    occurredOn: date,
    dueOn: date.nullish(),
    groupId: uuid.nullish(),
    items: z.array(item).max(100).optional(),

    installments: installments.nullish(),

    repeat: z
      .object({
        every: z.enum(["WEEK", "MONTH", "YEAR"]),
        dueAfterDays: z.number().int().min(0).max(DUE_AFTER_MAX).nullish(),
      })
      .nullish(),
    labels: labels.optional(),
  }),
  async (input, ctx) => {
    let other = input.counterpartId;
    if (!other && input.newPerson) {
      const c = await createManualContact(ctx, { id: input.newPerson.id, name: input.newPerson.name });
      other = c.partyId;
    }
    if (!other) throw new Error("counterpart required");
    const me = ctx.actor.partyId;
    if (input.repeat) {
      const rec = await createRecurring(ctx, {
        id: input.id,
        creditorId: input.direction === "THEY_OWE" ? me : other,
        debtorId: input.direction === "THEY_OWE" ? other : me,
        amount: input.amount,
        currency: input.currency,
        title: input.title,
        note: input.note ?? null,
        category: input.category ?? null,
        every: input.repeat.every,
        startOn: input.occurredOn,
        dueAfterDays: input.repeat.dueAfterDays ?? null,
        groupId: input.groupId ?? null,
      });
      return {
        id: rec.id,
        status: rec.status as "PENDING" | "ACTIVE",
        created: true,
        counterpartId: other,
        recurring: true,
      };
    }
    const res = await createObligation(ctx, {
      id: input.id,
      creditorId: input.direction === "THEY_OWE" ? me : other,
      debtorId: input.direction === "THEY_OWE" ? other : me,
      amount: input.amount,
      currency: input.currency,
      title: input.title,
      note: input.note ?? null,
      category: input.category ?? null,
      occurredOn: input.occurredOn,
      dueOn: input.dueOn ?? null,
      groupId: input.groupId ?? null,
      items: input.items,
      installments: input.installments ?? null,
    });
    if (input.labels?.length) await setDebtLabels(ctx, { obligationId: res.id, names: input.labels });
    return { ...res, counterpartId: other, recurring: false };
  },
);

export const guessDebtCategory = action(
  z.object({ title: z.string().max(100) }),
  (input, ctx) => guessCategory(ctx.actor, input.title),
  { rateLimit: false, revalidate: false },
);

export const setLabels = action(z.object({ obligationId: uuid, names: labels }), (input, ctx) =>
  setDebtLabels(ctx, input),
);

export const stopRepeat = action(z.object({ id: uuid }), (input, ctx) => stopRecurring(ctx, input));

export const recordGroupDebt = action(
  z.object({
    id: uuid,
    groupId: uuid,
    creditorId: uuid,
    debtorId: uuid,
    amount,
    currency: z.enum(CURRENCIES),
    title: z.string().min(1).max(100),
    category: z.enum(CATEGORIES).nullish(),
    occurredOn: date,
    dueOn: date.nullish(),
  }),
  (input, ctx) => createObligation(ctx, { ...input, category: input.category ?? null, dueOn: input.dueOn ?? null }),
);

export const editDebt = action(
  z.object({
    id: uuid,
    patch: z.object({
      amount: amount.optional(),
      dueOn: date.nullable().optional(),
      title: z.string().min(1).max(100).optional(),
      note: z.string().max(1000).nullable().optional(),
      category: z.enum(CATEGORIES).nullable().optional(),
      occurredOn: date.optional(),
      installments: installments.nullable().optional(),
    }),
    items: z.array(item).max(100).optional(),
  }),
  (input, ctx) => updateObligation(ctx, input),
);

export const deleteDebt = action(z.object({ id: uuid, reason: z.string().max(500).nullish() }), (input, ctx) =>
  voidObligation(ctx, input),
);

export const forgiveDebt = action(
  z.object({ obligationId: uuid, paidOn: date, amount: amount.nullish() }),
  (input, ctx) => forgive(ctx, { id: newId(), ...input }),
);
