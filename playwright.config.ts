import { defineConfig, devices } from "@playwright/test";

import { testDatabaseUrl } from "./tests/helpers/database-url";

const PORT = Number(process.env.E2E_PORT ?? 3101);
const DB = testDatabaseUrl(process.env.TEST_DATABASE_URL, "browser");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    baseURL: `http://localhost:${PORT}`,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  webServer: {
    command: `bun run build && bunx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: DB,
      APP_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      REALTIME_DRIVER: "pg",
      STORAGE_DRIVER: "local",
      BETTER_AUTH_SECRET: "catetin-browser-test-secret-123456",
      SIGNING_SECRET: "catetin-browser-signing-secret",
      CRON_SECRET: "catetin-browser-cron-secret",
      APP_ALLOWED_HOSTS: "localhost:*,127.0.0.1:*",
      SMTP_HOST: process.env.TEST_SMTP_HOST ?? "127.0.0.1",
      SMTP_PORT: process.env.TEST_SMTP_PORT ?? "32769",
      STORAGE_LOCAL_DIR: ".data/e2e-files",
      GEMINI_API_KEY: "",
    },
  },
});
