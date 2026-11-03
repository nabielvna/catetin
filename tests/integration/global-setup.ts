import type { TestProject } from "vitest/node";

import { testDatabaseUrl } from "../helpers/database-url";

export function setup(project: TestProject) {
  const url = testDatabaseUrl(process.env.TEST_DATABASE_URL);
  project.provide("databaseUrl", url);
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
