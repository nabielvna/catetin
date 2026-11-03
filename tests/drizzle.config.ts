import { defineConfig } from "drizzle-kit";

import { testDatabaseUrl } from "./helpers/database-url";

export default defineConfig({
  dialect: "postgresql",
  casing: "snake_case",
  schema: "./src/database/schema/index.ts",
  dbCredentials: { url: testDatabaseUrl(process.env.TEST_DATABASE_URL) },
});
