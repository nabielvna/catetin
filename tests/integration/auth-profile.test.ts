import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/database/client";
import { party, profile, session, user } from "@/database/schema";
import { newId } from "@/lib/server/ids";
import { consume, increment } from "@/lib/server/rate-limit";
import { ensureProfile, loadActor, updateProfile } from "@/services/account/profile";
import { listDevices, signOutDevice, signOutOtherDevices } from "@/services/account/sessions";
import { auth } from "@/services/auth";

const mail = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/integrations/email/send", () => ({ sendMail: mail.send }));

async function makeUser(name = "Ani") {
  const id = newId();
  const email = `${id}@example.com`;
  await db.insert(user).values({ id, name, email });
  await db.transaction((tx) => ensureProfile(tx, { id, name, email }));
  return (await loadActor(id))!;
}

async function addSession(userId: string) {
  const id = newId();
  await db
    .insert(session)
    .values({
      id,
      userId,
      token: newId(),
      expiresAt: new Date(Date.now() + 86400000),
      userAgent: "Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
    });
  return id;
}

describe("profile and session lifecycle", () => {
  it("creates exactly one party and profile when retried concurrently", async () => {
    const id = newId();
    const account = { id, name: "Ani", email: `${id}@example.com` };
    await db.insert(user).values(account);
    await Promise.all(Array.from({ length: 4 }, () => db.transaction((tx) => ensureProfile(tx, account))));
    expect(await db.select().from(party).where(eq(party.userId, id))).toHaveLength(1);
    expect(await db.select().from(profile).where(eq(profile.userId, id))).toHaveLength(1);
  });

  it("updates account preferences atomically and rejects invalid currency", async () => {
    const actor = await makeUser();
    await expect(updateProfile(actor, { name: "Changed", currency: "INVALID" })).rejects.toThrow("INVALID_INPUT");
    expect((await loadActor(actor.userId))?.name).toBe("Ani");
    await updateProfile(actor, {
      name: "Ani Putri",
      locale: "en",
      currency: "USD",
      timezone: "Asia/Singapore",
      onboarded: true,
    });
    expect(await loadActor(actor.userId)).toMatchObject({
      name: "Ani Putri",
      locale: "en",
      currency: "USD",
      timezone: "Asia/Singapore",
      onboarded: true,
    });
  });

  it("does not let one account sign out another account's device", async () => {
    const first = await makeUser();
    const other = await makeUser("Budi");
    const mine = await addSession(first.userId);
    const theirs = await addSession(other.userId);
    await expect(signOutDevice(first, theirs, mine)).rejects.toThrow("NOT_FOUND");
    expect(await db.select().from(session).where(eq(session.id, theirs))).toHaveLength(1);
    await expect(signOutDevice(first, mine, mine)).rejects.toThrow("INVALID_STATE");
    const extra = await addSession(first.userId);
    expect((await listDevices(first, mine))[0]?.id).toBe(mine);
    expect(await signOutOtherDevices(first, mine)).toBe(1);
    expect(await db.select().from(session).where(eq(session.id, extra))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.id, theirs))).toHaveLength(1);
  });

  it("signs in with an email code and creates the profile through lifecycle callbacks", async () => {
    mail.send.mockClear();
    const email = `${newId()}@example.com`;
    const provider = auth();
    await provider.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalled());
    const message = mail.send.mock.calls.find(([value]) => value.to === email)?.[0];
    const otp = message?.text.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeDefined();
    const result = await provider.api.signInEmailOTP({ body: { email, otp: otp! } });
    expect(result.user.email).toBe(email);
    expect(await loadActor(result.user.id)).toMatchObject({ email, onboarded: false });
    expect(await db.select().from(session).where(eq(session.userId, result.user.id))).toHaveLength(1);
  });
  it("repairs a missing profile when creating a session", async () => {
    const actor = await makeUser();
    await db.delete(profile).where(eq(profile.userId, actor.userId));
    mail.send.mockClear();
    const provider = auth();
    await provider.api.sendVerificationOTP({ body: { email: actor.email, type: "sign-in" } });
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalled());
    const message = mail.send.mock.calls.find(([value]) => value.to === actor.email)?.[0];
    const otp = message?.text.match(/\b\d{6}\b/)?.[0];
    await provider.api.signInEmailOTP({ body: { email: actor.email, otp: otp! } });
    expect(await loadActor(actor.userId)).toMatchObject({ partyId: actor.partyId });
    expect(await db.select().from(party).where(eq(party.userId, actor.userId))).toHaveLength(1);
  });

  it("counts concurrent writes atomically and enforces the rate limit", async () => {
    const key = `test:${newId()}`;
    const values = await Promise.all(Array.from({ length: 10 }, () => increment(key, 60)));
    expect([...values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(consume(key, 10, 60)).rejects.toThrow("RATE_LIMITED");
  });
});
