import "server-only";

import { io } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";

import type { Auth } from "./server";

const sessionForHeaders = cache(async (provider: () => Auth, h: Headers) => {
  await io();
  return provider().api.getSession({ headers: h });
});

export async function readSession(provider: () => Auth) {
  // Private cache scopes receive distinct Headers objects. Resolve that scope
  // before memoizing so a prerender's suspended IO cannot block another scope.
  const h = await headers();
  return sessionForHeaders(provider, h);
}
