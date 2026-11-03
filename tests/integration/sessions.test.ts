import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { session } from "@/database/schema/auth";
import { pushSubscription } from "@/database/schema/notifications";
import { newId } from "@/lib/server/ids";
import {
  describeDevice,
  listDevices,
  recordSessionLocation,
  signOutDevice,
  signOutOtherDevices,
} from "@/services/account/sessions";
import { savePushSubscription } from "@/services/account/settings";

import { makeUser } from "../helpers/factories";

const PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const LAPTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function addSession(userId: string, userAgent: string, opts: { expired?: boolean } = {}) {
  const id = newId();
  await db
    .insert(session)
    .values({
      id,
      userId,
      token: `t-${id}`,
      userAgent,
      expiresAt: new Date(Date.now() + (opts.expired ? -1 : 1) * 86_400_000),
    });
  return id;
}

describe("signed-in devices (D-68)", () => {
  it("device list: this device on top, expired sessions not shown", async () => {
    const andi = await makeUser("Andi");
    const phone = await addSession(andi.actor.userId, PHONE);
    const laptop = await addSession(andi.actor.userId, LAPTOP);
    await addSession(andi.actor.userId, LAPTOP, { expired: true });

    const devices = await listDevices(andi.actor, laptop);
    expect(devices.map((d) => d.id)).toEqual([laptop, phone]);
    expect(devices[0]).toMatchObject({ current: true, browser: "Chrome", os: "Windows", kind: "desktop" });
    expect(devices[1]).toMatchObject({ current: false, os: "Android", kind: "phone" });
  });

  it("signing out one device also deletes its push subscription; this device & others' devices are rejected", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const phone = await addSession(andi.actor.userId, PHONE);
    const laptop = await addSession(andi.actor.userId, LAPTOP);
    const budiPhone = await addSession(budi.actor.userId, PHONE);
    const endpoint = `https://push.example/${newId()}`;
    await savePushSubscription(andi.actor, { endpoint, p256dh: "k", auth: "a" }, phone);

    await expect(signOutDevice(andi.actor, laptop, laptop)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(signOutDevice(andi.actor, budiPhone, laptop)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await signOutDevice(andi.actor, phone, laptop);
    expect((await listDevices(andi.actor, laptop)).map((d) => d.id)).toEqual([laptop]);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint))).toHaveLength(0);
    expect(await listDevices(budi.actor, budiPhone)).toHaveLength(1);
  });

  it("signing out all other devices leaves only this device", async () => {
    const andi = await makeUser("Andi");
    const here = await addSession(andi.actor.userId, LAPTOP);
    await addSession(andi.actor.userId, PHONE);
    await addSession(andi.actor.userId, PHONE);
    expect(await signOutOtherDevices(andi.actor, here)).toBe(2);
    expect((await listDevices(andi.actor, here)).map((d) => d.id)).toEqual([here]);
  });

  it("location from Vercel headers is stored & shown; local IP hidden (D-69)", async () => {
    const andi = await makeUser("Andi");
    const here = await addSession(andi.actor.userId, PHONE);
    await db.update(session).set({ ipAddress: "103.10.64.12" }).where(eq(session.id, here));
    await recordSessionLocation(
      here,
      new Headers({
        "x-vercel-ip-city": "South%20Jakarta",
        "x-vercel-ip-country": "id",
        "x-vercel-ip-country-region": "JK",
      }),
    );
    const other = await addSession(andi.actor.userId, LAPTOP);
    await db.update(session).set({ ipAddress: "::1" }).where(eq(session.id, other));
    await recordSessionLocation(other, new Headers());

    const [a, b] = await listDevices(andi.actor, here);
    expect(a).toMatchObject({ id: here, city: "South Jakarta", country: "ID", ip: "103.10.64.12" });
    expect(b).toMatchObject({ id: other, city: null, country: null, ip: null });
  });

  it("model & browser name from Client Hints complete this device (D-70)", async () => {
    const andi = await makeUser("Andi");
    const here = await addSession(andi.actor.userId, PHONE);
    await describeDevice(here, { model: "Pixel 7", browser: "Brave" });
    const [d] = await listDevices(andi.actor, here);
    expect(d).toMatchObject({ model: "Pixel 7", browser: "Brave", os: "Android" });
  });
});
