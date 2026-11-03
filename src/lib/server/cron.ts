import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/server/env";

export function isCronAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
