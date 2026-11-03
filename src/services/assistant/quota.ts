import "server-only";

import { env } from "@/lib/server/env";
import { decrement, increment, peek } from "@/lib/server/rate-limit";

export function quotaLimits() {
  const e = env();
  return {
    userMessages: e.ASSISTANT_USER_MESSAGES_PER_DAY,
    userCalls: e.ASSISTANT_USER_CALLS_PER_DAY,
    appCalls: e.ASSISTANT_APP_CALLS_PER_DAY,
  };
}

const RESET_TZ = "America/Los_Angeles";

export type QuotaBlock = { scope: "user" | "app"; resetAt: string };

function partsIn(tz: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return p;
}

export function quotaDay(now = new Date()): { day: string; resetAt: Date } {
  const p = partsIn(RESET_TZ, now);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

  const wall = Date.UTC(p.year, p.month - 1, p.day + 1);
  const q = partsIn(RESET_TZ, new Date(wall));
  const offset = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second) - wall;
  return { day, resetAt: new Date(wall - offset) };
}

const keys = (userId: string, day: string) => ({
  app: `ai:app:${day}`,
  userCalls: `ai:calls:${userId}:${day}`,
  userMessages: `ai:msgs:${userId}:${day}`,
});

function windowSeconds(resetAt: Date, now: Date) {
  return Math.max(60, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

export async function quotaStatus(userId: string, now = new Date()): Promise<QuotaBlock | null> {
  const { day, resetAt } = quotaDay(now);
  const k = keys(userId, day);
  const [app, calls, msgs] = await Promise.all([peek(k.app), peek(k.userCalls), peek(k.userMessages)]);
  const max = quotaLimits();
  if (app >= max.appCalls) return { scope: "app", resetAt: resetAt.toISOString() };
  if (calls >= max.userCalls || msgs >= max.userMessages) return { scope: "user", resetAt: resetAt.toISOString() };
  return null;
}

export async function takeQuota(userId: string, newMessage: boolean, now = new Date()): Promise<QuotaBlock | null> {
  const blocked = await quotaStatus(userId, now);
  if (blocked) return blocked;
  if (newMessage) {
    const { day, resetAt } = quotaDay(now);

    const n = await increment(keys(userId, day).userMessages, windowSeconds(resetAt, now));
    if (n > quotaLimits().userMessages) return { scope: "user", resetAt: resetAt.toISOString() };
  }
  return null;
}

export async function refundMessage(userId: string, now = new Date()): Promise<void> {
  await decrement(keys(userId, quotaDay(now).day).userMessages);
}

export async function countModelCall(userId: string, now = new Date()): Promise<void> {
  const { day, resetAt } = quotaDay(now);
  const k = keys(userId, day);
  const secs = windowSeconds(resetAt, now);
  await Promise.all([increment(k.app, secs), increment(k.userCalls, secs)]);
}
