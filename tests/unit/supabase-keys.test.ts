import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = { ...privateKey.export({ format: "jwk" }), kid: "test-kid" };

vi.stubEnv("DATABASE_URL", "postgres://x@localhost/x");
vi.stubEnv("SUPABASE_JWT_PRIVATE_KEY", JSON.stringify(jwk));
vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_abc");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ.legacy.key");

const { supabaseHeaders, supabaseServerKey } = await import("@/integrations/supabase/keys");

const { realtimeToken } = await import("@/integrations/realtime/token");

describe("Supabase keys (D-113)", () => {
  it("new sb_ keys go in apikey only; legacy JWT keys also as bearer", () => {
    expect(supabaseServerKey()).toBe("sb_secret_abc");
    expect(supabaseHeaders("sb_secret_abc", { "content-type": "x" })).toEqual({
      "apikey": "sb_secret_abc",
      "content-type": "x",
    });
    expect(supabaseHeaders("eyJ.legacy.key")).toEqual({
      apikey: "eyJ.legacy.key",
      authorization: "Bearer eyJ.legacy.key",
    });
  });

  it("Realtime token: ES256 with the imported key's kid, verifiable with its public key", () => {
    const token = realtimeToken("user-1", Date.UTC(2026, 9, 5))!;
    const [h, p, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", typ: "JWT", kid: "test-kid" });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toMatchObject({
      sub: "user-1",
      role: "authenticated",
      exp: Date.UTC(2026, 9, 5) / 1000 + 3600,
    });
    const ok = verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" },
      Buffer.from(s!, "base64url"),
    );
    expect(ok).toBe(true);
  });
});
