import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db, rawSql } from "@/database/client";
import { user } from "@/database/schema/auth";
import { newId } from "@/lib/server/ids";

describe("Postgres.js v4", () => {
  it("completes more parallel reads than the pool size without mixing results", async () => {
    const results = await Promise.all(
      Array.from({ length: 32 }, async (_, i) => {
        const [raw, mapped] = await Promise.all([
          rawSql()`select ${i}::int as n, pg_sleep(0.005)`,
          db.select({ n: sql<number>`${i}::int` }).from(sql`(select 1) as probe`),
        ]);
        return [raw[0]!.n, mapped[0]!.n];
      }),
    );
    expect(results).toEqual(Array.from({ length: 32 }, (_, i) => [i, i]));
  });

  it("drains parallel reads inside transactions alongside pooled reads", async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        i % 2 === 0
          ? db.transaction(async (tx) => {
              const results = await Promise.all([
                tx.select({ n: sql<number>`${i}::int` }).from(sql`(select 1) as probe`),
                tx.select({ n: sql<number>`${i + 1}::int` }).from(sql`(select 1) as probe`),
              ]);
              return results.map((rows) => rows[0]!.n);
            })
          : db
              .select({ n: sql<number>`${i}::int` })
              .from(sql`(select 1) as probe`)
              .then((rows) => [rows[0]!.n]),
      ),
    );
    expect(results).toEqual(Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? [i, i + 1] : [i])));
  });

  it("rejects a transaction with a swallowed SQL error and rolls its writes back", async () => {
    const id = newId();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(user).values({ id, name: "Rollback", email: `${id}@test.local` });
        try {
          await tx.execute(sql`select 1 / 0`);
        } catch {}
      }),
    ).rejects.toMatchObject({ code: "22012" });
    expect(await db.select().from(user).where(eq(user.id, id))).toHaveLength(0);
  });

  it("keeps Drizzle date, bigint, boolean and JSON mappings with server-inferred types", async () => {
    const instant = new Date("2026-11-04T18:30:00.123Z");
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local time zone 'Asia/Jakarta'`);
      const [row] = await tx
        .insert(user)
        .values({ id: newId(), name: "Types", email: `${newId()}@test.local`, emailVerified: true, createdAt: instant })
        .returning();
      expect(row!.createdAt).toEqual(instant);
      expect(row!.emailVerified).toBe(true);
      const rows = await tx.execute(sql`
        select ${"2026-11-05"}::date::text as day,
               ${"9007199254740993"}::bigint::text as amount,
               ${JSON.stringify({ enabled: true })}::jsonb as payload,
               array[1, 2, 3]::int[] as ids
      `);
      expect(rows[0]).toMatchObject({
        day: "2026-11-05",
        amount: "9007199254740993",
        payload: { enabled: true },
        ids: [1, 2, 3],
      });
      await tx.delete(user).where(eq(user.id, row!.id));
    });
  });
});
