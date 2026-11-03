import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import postgres from "postgres";

import { testDatabaseUrl } from "./helpers/database-url";

const url = testDatabaseUrl(process.env.TEST_DATABASE_URL);
const sql = postgres(url, { max: 1, prepare: false });
try {
  const tables = await sql<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'public'
  `;
  if (tables.length) throw new Error("Test database must be empty before preparing its schema.");
  await sql`create extension if not exists pg_trgm`;
  await sql`create extension if not exists unaccent`;

  const result = spawnSync("bun", ["x", "drizzle-kit", "push", "--config=tests/drizzle.config.ts"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error("Test database schema preparation failed.");
  await sql.unsafe(await readFile(new URL("./fixtures/database-guards.sql", import.meta.url), "utf8"));
} finally {
  await sql.end();
}
