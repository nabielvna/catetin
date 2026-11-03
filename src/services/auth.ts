import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import { user } from "@/database/schema";
import { DomainError } from "@/domain/errors";
import { type Auth, createAuth } from "@/integrations/auth/server";
import { readSession } from "@/integrations/auth/session";
import { ensureProfile, loadActor } from "@/services/account/profile";
import { recordSessionLocation } from "@/services/account/sessions";
import type { Actor } from "@/services/context";

const singleton = globalThis as unknown as { __catetinAuth?: Auth };

export function auth(): Auth {
  return (singleton.__catetinAuth ??= createAuth({
    afterUserCreated: async (u) => {
      await db.transaction((tx) => ensureProfile(tx, u));
    },
    afterSessionCreated: async (id, userId, requestHeaders) => {
      const [account] = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, userId));
      if (account) await db.transaction((tx) => ensureProfile(tx, account));
      await recordSessionLocation(id, requestHeaders);
    },
    loadAccount: loadActor,
  }));
}

export { googleEnabled } from "@/integrations/auth/server";
export const getSession = () => readSession(auth);

export async function currentSessionId(): Promise<string | null> {
  return (await getSession())?.session.id ?? null;
}

const actorForUser = cache((userId: string) => loadActor(userId));

export const getActor = async (): Promise<Actor | null> => {
  const s = await getSession();
  if (!s) return null;
  return actorForUser(s.user.id);
};

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new DomainError("UNAUTHENTICATED");
  return actor;
}
