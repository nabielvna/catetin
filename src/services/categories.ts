import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/database/client";
import { categoryAiCache, categoryMemory } from "@/database/schema/categories";
import { CATEGORIES, type Category, isCategory, suggestCategory } from "@/domain/debt";
import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";
import { increment, peek } from "@/lib/server/rate-limit";
import { quotaDay, quotaLimits } from "@/services/assistant/quota";
import type { Actor } from "@/services/context";

const STOP = new Set([
  "dan",
  "yang",
  "untuk",
  "buat",
  "ke",
  "di",
  "dari",
  "the",
  "and",
  "for",
  "with",
  "utang",
  "hutang",
  "bayar",
]);

export function titleTokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}

export function titleKey(title: string): string {
  return titleTokens(title).sort().join(" ");
}

export async function learnCategory(tx: DbOrTx, userId: string, title: string, category: string | null | undefined) {
  if (!category || !isCategory(category)) return;
  const tokens = titleTokens(title);
  if (tokens.length === 0) return;
  await tx
    .insert(categoryMemory)
    .values(tokens.map((token) => ({ userId, token, category })))
    .onConflictDoUpdate({
      target: [categoryMemory.userId, categoryMemory.token, categoryMemory.category],
      set: { hits: sql`${categoryMemory.hits} + 1`, updatedAt: sql`now()` },
    });
}

export async function guessFromMemory(tx: DbOrTx, userId: string, title: string): Promise<Category | null> {
  const tokens = titleTokens(title);
  if (tokens.length === 0) return null;
  const rows = await tx
    .select({ category: categoryMemory.category, score: sql<number>`sum(${categoryMemory.hits})::int` })
    .from(categoryMemory)
    .where(and(eq(categoryMemory.userId, userId), inArray(categoryMemory.token, tokens)))
    .groupBy(categoryMemory.category)
    .orderBy(sql`2 desc`)
    .limit(2);
  const [best, second] = rows;
  if (!best || !isCategory(best.category)) return null;

  if (second && second.score === best.score) return null;
  return best.category;
}

export const AI_GUESSES_PER_USER_DAY = 30;

const APP_SHARE = 0.7;

async function guessWithAi(actor: Actor, title: string): Promise<Category | null> {
  const key = env().GEMINI_API_KEY;
  if (!key) return null;
  const tk = titleKey(title);
  if (!tk) return null;
  const [cached] = await db.select().from(categoryAiCache).where(eq(categoryAiCache.titleKey, tk));
  if (cached) return cached.category && isCategory(cached.category) ? cached.category : null;

  const now = new Date();
  const { day, resetAt } = quotaDay(now);
  if ((await peek(`ai:app:${day}`)) >= quotaLimits().appCalls * APP_SHARE) return null;
  const secs = Math.max(60, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  if ((await increment(`ai:cat:${actor.userId}:${day}`, secs)) > AI_GUESSES_PER_USER_DAY) return null;
  await increment(`ai:app:${day}`, secs);

  try {
    const google = createGoogleGenerativeAI({ apiKey: key });
    const { output } = await generateText({
      model: google(env().GEMINI_MODEL),
      temperature: 0,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(6000),
      output: Output.choice({ options: [...CATEGORIES] }),
      prompt:
        "Pick one spending category for this debt record title (Indonesian/English, may be abbreviated/slang). " +
        "FOOD=food/drinks, SHOPPING=buying goods, TRANSPORT, BILLS=bills/subscriptions/phone credit, RENT=boarding house/rent, " +
        "ENTERTAINMENT, HEALTH, EDUCATION, TRAVEL=holiday/hotel, CASH_LOAN=borrowed cash, " +
        "SHARED=chip-in/gift/arisan, OTHER=unclear.\nTitle: " +
        JSON.stringify(title.slice(0, 100)),
    });
    const category = output && isCategory(output) && output !== "OTHER" ? output : null;
    await db.insert(categoryAiCache).values({ titleKey: tk, category }).onConflictDoNothing();
    return category;
  } catch (err) {
    log.warn({ err }, "category ai guess failed");
    return null;
  }
}

export type CategoryGuess = { category: Category | null; source: "memory" | "keyword" | "ai" | null };

export async function guessCategory(actor: Actor, title: string): Promise<CategoryGuess> {
  const t = title.trim();
  if (t.length < 3) return { category: null, source: null };
  const mem = await guessFromMemory(db, actor.userId, t);
  if (mem) return { category: mem, source: "memory" };
  const kw = suggestCategory(t);
  if (kw) return { category: kw, source: "keyword" };
  const ai = await guessWithAi(actor, t);
  return ai ? { category: ai, source: "ai" } : { category: null, source: null };
}
