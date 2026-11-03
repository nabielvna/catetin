import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.REALTIME_DRIVER = "none";
process.env.STORAGE_LOCAL_DIR = `${process.env.TMPDIR ?? "/tmp"}/catetin-test-files`;

process.env.STORAGE_DRIVER = "local";
process.env.SMTP_HOST = process.env.TEST_SMTP_HOST ?? "127.0.0.1";
process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? "32769";
