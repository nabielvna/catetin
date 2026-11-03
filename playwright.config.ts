import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const DB = "postgres://catetin:catetin@localhost:54330/catetin_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
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
      SMTP_HOST: "localhost",
      SMTP_PORT: "1026",
      STORAGE_LOCAL_DIR: ".data/e2e-files",
      GEMINI_API_KEY: "",
    },
  },
});
