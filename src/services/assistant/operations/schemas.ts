import "server-only";

import { z } from "zod";

import { isCurrency } from "@/domain/money";

export const uuid = z.uuid();

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(isCurrency, "unknown currency")
  .describe("ISO 4217 code, e.g. IDR, USD");

export const personRef = z
  .object({
    partyId: uuid.optional().describe("partyId of a known person"),
    newPersonName: z.string().min(1).max(60).optional().describe("name of a new person (manual contact)"),
  })
  .describe("Fill exactly one: partyId or newPersonName");
