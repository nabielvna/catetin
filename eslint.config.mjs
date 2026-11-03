import path from "node:path";
import { builtinModules } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const nodeModules = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const architectureRule = {
  meta: { type: "problem", schema: [], messages: { boundary: "{{reason}}" } },
  create(context) {
    const filename = context.filename;
    const sourceRoot = path.resolve("src");
    const owner = path.relative(sourceRoot, filename).split(path.sep).join("/");
    let client = false;
    const belongs = (name, folder) => name === folder || name.startsWith(`${folder}/`);
    const check = (node, specifier, typeOnly = false) => {
      if (typeof specifier !== "string") return;
      let destination = null;
      if (specifier.startsWith("@/")) destination = specifier.slice(2);
      else if (specifier.startsWith(".")) {
        destination = path
          .relative(sourceRoot, path.resolve(path.dirname(filename), specifier))
          .split(path.sep)
          .join("/");
      }
      const from = owner.split("/")[0];
      const report = (reason) => context.report({ node, messageId: "boundary", data: { reason } });
      if (from === "domain" && (specifier.startsWith("node:") || nodeModules.has(specifier))) {
        report("Domain rules must not import Node.js IO modules.");
        return;
      }
      if (typeOnly && from !== "domain") return;
      if (destination !== null) {
        const forbidden =
          {
            domain: [
              "actions",
              "services",
              "database",
              "integrations",
              "jobs",
              "app",
              "components",
              "lib/server",
              "i18n",
            ],
            services: ["actions", "app", "components", "jobs"],
            database: ["actions", "services", "integrations", "jobs", "app", "components"],
            integrations: ["actions", "services", "jobs", "app", "components"],
            actions: ["database", "app", "components", "jobs"],
          }[from] ?? [];
        if (forbidden.some((folder) => belongs(destination, folder))) {
          report(`${from} must not depend on ${destination}; follow docs/architecture.md.`);
          return;
        }
        if (from === "app" && belongs(destination, "database")) {
          report("Pages and HTTP routes access database data through services.");
          return;
        }
        if (from === "components" || client) {
          if (["services", "database", "jobs", "lib/server"].some((folder) => belongs(destination, folder))) {
            report("UI runtime uses Server Actions, not service/database/server helpers.");
            return;
          }
          if (
            belongs(destination, "integrations") &&
            !/(?:^|\/)(?:client|[^/]+-client)(?:\.[cm]?[jt]sx?)?$/.test(destination)
          ) {
            report("UI may only import explicit browser integration entry points.");
          }
        }
      }
      if (
        client &&
        (specifier.startsWith("node:") ||
          nodeModules.has(specifier) ||
          ["server-only", "next/headers", "next/server", "postgres", "drizzle-orm"].includes(specifier))
      ) {
        report("Client components cannot import server runtime dependencies.");
      }
    };
    return {
      Program(node) {
        client = node.body.some(
          (statement) => statement.type === "ExpressionStatement" && statement.directive === "use client",
        );
      },
      ImportDeclaration(node) {
        const typeOnly =
          node.importKind === "type" ||
          (node.specifiers.length > 0 && node.specifiers.every((part) => part.importKind === "type"));
        check(node, node.source.value, typeOnly);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value, node.exportKind === "type");
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value, node.exportKind === "type");
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require" && node.arguments.length === 1) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { architecture: { rules: { boundaries: architectureRule } } },
    rules: { "architecture/boundaries": "error" },
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/actions/**",
                "@/services/**",
                "@/database/**",
                "@/integrations/**",
                "@/jobs/**",
                "@/lib/server/**",
                "node:*",
                "@/app/**",
                "@/components/**",
                "next",
                "next/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "react",
              ],
              message: "src/domain must be pure (no IO/framework).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.tsx", "src/app/**/*-client.tsx", "src/app/**/*-form.tsx", "src/app/**/*-view.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/database/**", "@/services/**", "@/jobs/**", "@/lib/server/**"],
              allowTypeImports: true,
              message: "UI components use Server Actions; page Server Components may call services.",
            },
          ],
        },
      ],
    },
  },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    "public/sw.js",
    "src/database/migrations/**",
  ]),
]);

export default eslintConfig;
