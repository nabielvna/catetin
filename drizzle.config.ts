import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/index.ts",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "" },
});
