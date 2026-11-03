import "server-only";

import { db } from "@/database/client";
import { emailSuppression } from "@/database/schema/notifications";
import { verify } from "@/lib/server/signing";

export async function suppressEmail(token: string) {
  const email = verify(token);
  if (!email) return null;
  await db.insert(emailSuppression).values({ email, reason: "UNSUBSCRIBE" }).onConflictDoNothing();
  return email;
}
