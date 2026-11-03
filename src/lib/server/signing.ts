import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/server/env";

export function sign(value: string): string {
  const mac = createHmac("sha256", env().SIGNING_SECRET).update(value).digest("base64url");
  return `${Buffer.from(value).toString("base64url")}.${mac}`;
}

export function verify(token: string): string | null {
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  const value = Buffer.from(b64, "base64url").toString();
  const expected = createHmac("sha256", env().SIGNING_SECRET).update(value).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value;
}
