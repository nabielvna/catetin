import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { account, user } from "@/database/schema/auth";
import { party } from "@/database/schema/people";
import { deleteAccount } from "@/services/account/delete";
import { exportMyData } from "@/services/account/export";
import { signInMethods } from "@/services/account/sign-in-methods";
import { getPerson } from "@/services/people/queries";

import { connected, debt, makeUser, obligationRow, record } from "../helpers/factories";

describe("delete account (D-15)", () => {
  it("personal data gone, friends' records stay intact with the old name", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const d = await record(budi, debt(andi, budi, 50_000));
    await record(andi, debt(andi, budi, 10_000));
    await deleteAccount(budi.actor);

    expect(await db.select().from(user).where(eq(user.id, budi.actor.userId))).toHaveLength(0);
    const [p] = await db.select().from(party).where(eq(party.id, budi.actor.partyId));
    expect(p!.userId).toBeNull();
    expect(p!.accountDeletedAt).not.toBeNull();
    expect((await obligationRow(d.id)).status).toBe("ACTIVE");

    const view = await getPerson(andi.actor, budi.actor.partyId);
    expect(view?.header.state).toBe("DELETED");
    expect(view?.header.name).toBe("Budi");
    expect(view?.entries.find((e) => e.id === d.id)).toBeDefined();
  });

  it("data download contains my records", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    await record(budi, debt(andi, budi, 50_000, { title: "Kopi" }));
    const data = await exportMyData(andi.actor);
    expect(data.obligations.map((o) => (o as { title: string }).title)).toContain("Kopi");
  });
});

describe("sign-in methods", () => {
  it("Google is only linked when that user has a google provider account", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    expect(await signInMethods(andi.actor)).toEqual({ google: null });

    await db.insert(account).values({ accountId: "g-budi", providerId: "google", userId: budi.actor.userId });
    expect(await signInMethods(andi.actor)).toEqual({ google: null });
    expect((await signInMethods(budi.actor)).google?.linkedAt).toEqual(expect.any(String));
  });
});
