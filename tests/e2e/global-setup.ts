import { testDatabaseUrl } from "../helpers/database-url";

export default function globalSetup() {
  process.env.E2E_RUN_ID ??= Date.now().toString(36);
  testDatabaseUrl(process.env.TEST_DATABASE_URL, "browser");
}
