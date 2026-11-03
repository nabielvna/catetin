export const NUDGE_COOKIE = "catetin_nudge";

export type NudgeKind = "push" | "install";

export function parseNudge(value: string | undefined): NudgeKind | null {
  return value === "push" || value === "install" ? value : null;
}
