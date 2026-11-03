import "server-only";

import { createHmac, createPrivateKey, sign } from "node:crypto";

import { env } from "@/lib/server/env";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function realtimeToken(userId: string, now = Date.now()): string | null {
  const e = env();
  const iat = Math.floor(now / 1000);
  const payload = b64url(
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated", iat, exp: iat + 3600 }),
  );
  if (e.SUPABASE_JWT_PRIVATE_KEY) {
    const jwk = JSON.parse(e.SUPABASE_JWT_PRIVATE_KEY) as { kid?: string; crv?: string };
    if (!jwk.kid || jwk.crv !== "P-256") throw new Error("SUPABASE_JWT_PRIVATE_KEY must be a P-256 JWK with a kid");
    const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: jwk.kid }));
    const key = createPrivateKey({ key: jwk as never, format: "jwk" });
    const sig = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
    return `${header}.${payload}.${b64url(sig)}`;
  }
  if (e.SUPABASE_JWT_SECRET) {
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const sig = createHmac("sha256", e.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${sig}`;
  }
  return null;
}
