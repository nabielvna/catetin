import "server-only";

import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "@/database/client";
import { session } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { type DeviceInfo, displayIp, parseUserAgent } from "@/lib/user-agent";
import type { Actor } from "@/services/context";

export type Device = DeviceInfo & {
  id: string;
  current: boolean;
  signedInAt: string;

  lastActiveAt: string;

  ip: string | null;

  city: string | null;
  country: string | null;

  model: string | null;
};

type Location = { city: string | null; region: string | null; country: string | null };

function header(headers: Headers, name: string): string | null {
  const v = headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, 80);
  } catch {
    return v.slice(0, 80);
  }
}

export function locationFromHeaders(headers: Headers | null | undefined): Location | null {
  if (!headers) return null;
  const loc = {
    city: header(headers, "x-vercel-ip-city"),
    region: header(headers, "x-vercel-ip-country-region"),
    country: header(headers, "x-vercel-ip-country")?.toUpperCase().slice(0, 2) ?? null,
  };
  return loc.city || loc.country ? loc : null;
}

export async function recordSessionLocation(sessionId: string, headers: Headers | null | undefined) {
  const loc = locationFromHeaders(headers);
  if (loc) await db.update(session).set(loc).where(eq(session.id, sessionId));
}

export async function listDevices(actor: Actor, currentId: string | null, now = new Date()): Promise<Device[]> {
  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      city: session.city,
      country: session.country,
      deviceModel: session.deviceModel,
      browserName: session.browserName,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
    .from(session)
    .where(and(eq(session.userId, actor.userId), gt(session.expiresAt, now)))
    .orderBy(desc(session.updatedAt));
  return rows
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      signedInAt: r.createdAt.toISOString(),
      lastActiveAt: r.updatedAt.toISOString(),
      ip: displayIp(r.ipAddress),
      city: r.city,
      country: r.country,
      model: r.deviceModel,
      ...parseUserAgent(r.userAgent),

      ...(r.browserName ? { browser: r.browserName } : {}),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export async function signOutDevice(actor: Actor, id: string, currentId: string | null): Promise<void> {
  if (id === currentId) throw new DomainError("INVALID_STATE");
  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, actor.userId)))
    .returning({ id: session.id });
  if (deleted.length === 0) throw new DomainError("NOT_FOUND");
}

export async function signOutOtherDevices(actor: Actor, currentId: string | null): Promise<number> {
  if (!currentId) throw new DomainError("UNAUTHENTICATED");
  const deleted = await db
    .delete(session)
    .where(and(eq(session.userId, actor.userId), ne(session.id, currentId)))
    .returning({ id: session.id });
  return deleted.length;
}

export async function describeDevice(
  currentId: string | null,
  info: { model: string | null; browser: string | null },
): Promise<void> {
  if (!currentId) return;
  await db
    .update(session)
    .set({ deviceModel: info.model?.slice(0, 60) || null, browserName: info.browser?.slice(0, 40) || null })
    .where(eq(session.id, currentId));
}
