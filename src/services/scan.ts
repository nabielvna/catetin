import "server-only";

import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";

import { todayIn } from "@/domain/dates";
import { CATEGORIES } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { normalizeScan, type Receipt, SCAN_MAX_PHOTOS, SCAN_METHODS } from "@/domain/receipt";
import type { Actor } from "@/services/context";
import { sniff } from "@/services/files";

export const SCAN_MAX_BYTES = 4 * 1024 * 1024;

export type ScanPurpose = "bill" | "debt" | "payment";

const num = z.number().nullable();
const schema = z.object({
  kind: z.enum(["RECEIPT", "TRANSFER", "OTHER"]),
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  currency: z.string().nullable(),

  items: z.array(z.object({ name: z.string(), quantity: num, total: z.number(), photo: z.number() })),
  subtotal: num,
  discount: num,
  servicePercent: num,
  serviceAmount: num,
  taxPercent: num,
  taxAmount: num,
  rounding: num,
  total: num,
  category: z.enum(CATEGORIES).nullable(),
  method: z.enum(SCAN_METHODS).nullable(),
  note: z.string().nullable(),
});

const PURPOSE: Record<ScanPurpose, string> = {
  bill: "The user wants to split this bill, so the item breakdown is very important.",
  debt: "The user wants to record a debt for the total paid.",
  payment:
    "The user wants to record a debt payment; this is usually a screenshot of a bank transfer / e-wallet receipt.",
};

function prompt(purpose: ScanPurpose, today: string, currency: Currency) {
  return [
    "Read this shopping receipt / bill / transfer proof and fill in its data. More than one photo = parts of the same long receipt, in order from top to bottom.",
    PURPOSE[purpose],
    "kind: RECEIPT = receipt/bill/invoice, TRANSFER = bank transfer/e-wallet/QRIS proof, OTHER = neither or unreadable (leave the rest null/empty).",
    "ALL amounts are plain numbers in whole currency units WITHOUT thousands separators: 'Rp 25.000' → 25000, '1,250,000' → 1250000, '$12.50' → 12.5.",
    "items: every purchased line, top to bottom; total = line price (already multiplied by quantity), quantity = quantity if printed, photo = number of the photo where the line was read (1 for the first photo, etc.). Discount/service/tax/total lines are NOT items. Tidy item names (normal capitalization, keep common abbreviations and the receipt's language), but write exactly the same name when the same line is visible in two photos.",
    "Consecutive photos usually overlap by a few lines: a line visible at the end of one photo and at the start of the next is recorded only ONCE (use the first photo's number). Items genuinely ordered twice (two separate lines on the receipt) are still recorded twice.",
    "discount = total discount (positive number). servicePercent/taxPercent = printed percentage (e.g. 10), serviceAmount/taxAmount = the amount. Tax includes PB1/PPN/VAT. rounding = the rounding line (may be negative). total = what was actually paid.",
    "merchant: store/restaurant name with normal capitalization (e.g. 'KOPI KENANGAN' → 'Kopi Kenangan'); for transfer proofs: the recipient's name.",
    `date: transaction date as YYYY-MM-DD (Indonesian receipts usually use DD/MM/YY). Today is ${today}. null if absent.`,
    `currency: ISO 4217 code from the symbol/context (Rp → IDR, RM → MYR, S$ → SGD, ฿ → THB). If there's no hint: ${currency}.`,
    "category: guessed spending category (FOOD food/drinks, SHOPPING, TRANSPORT, BILLS, etc.), null if unsure.",
    "method: CASH/TRANSFER/EWALLET/CARD if visible. note: for transfer proofs only, short e.g. 'BCA → Budi Santoso' (no full account number); otherwise null.",
    "Don't make things up: leave unreadable parts null.",
  ].join("\n");
}

export async function scanReceipt(
  actor: Actor,
  photos: Uint8Array[],
  purpose: ScanPurpose,
  currency: Currency,
  model: LanguageModel,
): Promise<Receipt> {
  if (photos.length === 0 || photos.length > SCAN_MAX_PHOTOS) throw new DomainError("FILE_REJECTED");
  const files = photos.map((data) => {
    const mediaType = data.length <= SCAN_MAX_BYTES ? sniff(Buffer.from(data)) : null;
    if (!mediaType || mediaType === "image/heic") throw new DomainError("FILE_REJECTED");
    return { type: "file" as const, mediaType, data };
  });
  const today = todayIn(actor.timezone, new Date());
  const { output } = await generateText({
    model,
    temperature: 0,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(25_000),
    output: Output.object({ schema }),
    messages: [{ role: "user", content: [{ type: "text", text: prompt(purpose, today, currency) }, ...files] }],
  });
  return normalizeScan(output, currency, today);
}
