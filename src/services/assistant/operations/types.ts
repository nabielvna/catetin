import "server-only";

import { type ErrorCode } from "@/domain/errors";
import type { Contact } from "@/services/assistant/context";
import type { Actor, Ctx } from "@/services/context";

export type Preview = {
  title: string;
  lines: string[];

  danger?: string;

  confirm: string;

  review?: string;
};

export type Review = { form: string; view?: string };

export type Undo = { tool: string; input: Record<string, unknown> };

export type OpOk = {
  ok: true;

  summary: string;
  href?: string;
  undo?: Undo;

  link?: string;

  status?: string;

  locale?: "id" | "en";

  reviewed?: boolean;
};

export type OpFail = { ok: false; code: ErrorCode; message: string };

export type OpOutput = OpOk | OpFail;

export type Env = {
  actor: Actor;
  contacts: Contact[];
  t: (key: string, values?: Record<string, string | number>) => string;
  fmt: (minor: number, currency: string) => string;
  nameOf: (partyId: string) => string;

  images: () => Buffer[];
};

export type Op<I> = {
  preview: (input: I, env: Env) => Promise<Preview | "auto">;

  review?: (input: I, env: Env) => Review | null;
  run: (input: I, ctx: Ctx, env: Env) => Promise<Omit<OpOk, "ok">>;
};
