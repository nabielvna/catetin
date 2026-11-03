import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/helpers/server-only.ts", import.meta.url).pathname },
  },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "integration",
          globalSetup: "./tests/integration/global-setup.ts",
          setupFiles: ["./tests/integration/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 120_000,
          // Run database tests sequentially to avoid shared-state interference.
          fileParallelism: false,
        },
      },
    ],
  },
});
