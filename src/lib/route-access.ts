export const PROTECTED = [
  "/home",
  "/people",
  "/groups",
  "/debts",
  "/records",
  "/payments",
  "/bills",
  "/inbox",
  "/account",
  "/onboarding",
  "/search",
  "/stats",
];
const GUEST_ONLY = ["/", "/login"];

export function isProtectedPath(path: string): boolean {
  return PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isGuestOnlyPath(path: string): boolean {
  return GUEST_ONLY.includes(path);
}
