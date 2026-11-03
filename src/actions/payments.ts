"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { CURRENCIES } from "@/domain/money";
import { latestRate } from "@/services/currencies";
import { recordPayment, voidSettlement } from "@/services/payments/mutations";
import { proposeOffset } from "@/services/payments/offsets";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.number().int().positive().max(1_000_000_000_000);
const rate = z.string().regex(/^\d{1,12}(\.\d{1,10})?$/);

export const pay = action(
  z.object({
    id: uuid,
    pairId: uuid,
    payerId: uuid,
    amount,
    currency: z.enum(CURRENCIES),
    method: z.enum(["CASH", "TRANSFER", "EWALLET", "OTHER"]),
    paidOn: date,
    note: z.string().max(1000).nullish(),
    counterCurrency: z.enum(CURRENCIES).nullish(),
    rate: rate.nullish(),
    allocations: z
      .array(z.object({ obligationId: uuid, amount }))
      .max(200)
      .nullish(),
    groupId: uuid.nullish(),

    allowExcess: z.boolean().optional(),
  }),
  (input, ctx) => recordPayment(ctx, input),
);

export const offset = action(
  z.object({
    id: uuid,
    pairId: uuid,
    amount,
    currency: z.enum(CURRENCIES),
    counterCurrency: z.enum(CURRENCIES).nullish(),
    rate: rate.nullish(),
    paidOn: date,
    note: z.string().max(1000).nullish(),
  }),
  (input, ctx) => proposeOffset(ctx, input),
);

export const cancelPayment = action(z.object({ id: uuid, reason: z.string().max(500).nullish() }), (input, ctx) =>
  voidSettlement(ctx, input),
);

export const suggestRate = action(
  z.object({ from: z.enum(CURRENCIES), to: z.enum(CURRENCIES) }),
  async (input) => ({ rate: await latestRate(input.from, input.to) }),
  { revalidate: false },
);
