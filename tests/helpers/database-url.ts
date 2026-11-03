export function testDatabaseUrl(value: string | undefined, kind: "integration" | "browser" = "integration"): string {
  if (!value) throw new Error("Set TEST_DATABASE_URL to a dedicated test database.");
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  const pattern = kind === "browser" ? /^catetin_e2e(?:_|$)/ : /^catetin_(test|e2e)(?:_|$)/;
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !pattern.test(database)) {
    throw new Error("Use a dedicated catetin_test or catetin_e2e database, with an optional suffix.");
  }
  return value;
}
