export const VIA = ["APP", "ASSISTANT", "SPLIT", "SIMPLIFY", "MIGRATION"] as const;
export type Via = (typeof VIA)[number];
