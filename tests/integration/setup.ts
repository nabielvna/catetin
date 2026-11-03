import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.REALTIME_DRIVER = "none";
process.env.STORAGE_LOCAL_DIR = `${process.env.TMPDIR ?? "/tmp"}/catetin-test-files`;
