"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { CATEGORIES } from "@/domain/debt";
import { CURRENCIES } from "@/domain/money";
import { createBill } from "@/services/bills/mutations";
import { createManualContact } from "@/services/people/mutations";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minor = z.number().int().min(0).max(1_000_000_000_000);

export const saveBill = action(
  z.object({
    id: uuid,
    title: z.string().min(1).max(100),
    occurredOn: date,
    dueOn: date.nullish(),
    currency: z.enum(CURRENCIES),
    category: z.enum(CATEGORIES).nullish(),
    groupId: uuid.nullish(),
    payerId: uuid,
    newPeople: z.array(z.object({ id: uuid, name: z.string().min(1).max(60) })).max(50),
    split: z.object({
      participants: z.array(uuid).min(1).max(60),
      mode: z.enum(["EQUAL", "ITEMS", "EXACT", "PERCENT", "SHARES"]),
      items: z
        .array(
          z.object({
            id: z.string().max(40),
            name: z.string().min(1).max(100),
            amount: minor,
            assignees: z.array(uuid).max(60).optional(),
          }),
        )
        .max(200)
        .optional(),
      subtotal: minor.optional(),
      exact: z.record(z.string(), minor).optional(),
      percent: z.record(z.string(), z.number().int().min(0).max(10_000)).optional(),
      shares: z.record(z.string(), z.number().int().min(0).max(1000)).optional(),
      discount: z
        .union([
          z.object({ type: z.literal("AMOUNT"), value: minor }),
          z.object({ type: z.literal("PERCENT"), bps: z.number().int().min(0).max(10_000) }),
        ])
        .nullish(),
      serviceBps: z.number().int().min(0).max(10_000).optional(),
      taxBps: z.number().int().min(0).max(10_000).optional(),
      serviceAmount: minor.optional(),
      taxAmount: minor.optional(),
      taxIncludesService: z.boolean().optional(),
    }),
  }),
  async (input, ctx) => {
    for (const p of input.newPeople) await createManualContact(ctx, p);
    return createBill(ctx, input);
  },
);
