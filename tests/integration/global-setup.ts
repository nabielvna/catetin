import type { TestProject } from "vitest/node";

export function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a test database prepared with v2 tooling.");
  const database = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/^catetin_v3_(test|e2e)(?:_|$)/.test(database)) {
    throw new Error("Integration tests require a dedicated catetin_v3_test or catetin_v3_e2e database.");
  }
  project.provide("databaseUrl", url);
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
