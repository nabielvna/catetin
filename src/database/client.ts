import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "@/database/schema/index";
import { env } from "@/lib/server/env";

export type Db = PostgresJsDatabase<typeof schema>;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __catetinSql?: Sql; __catetinDb?: Db };

function create(): { sql: Sql; db: Db } {
  const sql = postgres(env().DATABASE_URL, {
    max: env().NODE_ENV === "production" ? 5 : 10,

    // Supabase transaction pooling does not support prepared statements.
    prepare: false,
    // Supavisor transaction pooling cannot pipeline independent queries on one
    // connection. Keep parallel reads across the pool, with one in flight each.
    max_pipeline: 1,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

function get() {
  if (!globalForDb.__catetinDb || !globalForDb.__catetinSql) {
    const { sql, db } = create();
    globalForDb.__catetinSql = sql;
    globalForDb.__catetinDb = db;
  }
  return { sql: globalForDb.__catetinSql, db: globalForDb.__catetinDb };
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    return Reflect.get(get().db, prop);
  },
});

export function rawSql(): Sql {
  return get().sql;
}

export { schema };
