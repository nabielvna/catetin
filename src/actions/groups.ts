"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { CURRENCIES } from "@/domain/money";
import { newId } from "@/lib/server/ids";
import {
  addMembers,
  archiveGroup,
  createGroup,
  leaveGroup,
  proposeModeChange,
  removeMember,
  renameGroup,
  respondGroupInvite,
  setMemberRole,
} from "@/services/groups/mutations";
import { proposeSimplify } from "@/services/groups/simplify";

const uuid = z.uuid();
const manual = z.array(z.object({ id: uuid, name: z.string().min(1).max(60) })).max(50);

export const newGroup = action(
  z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(60),
    mode: z.enum(["CONFIRM", "TRUST"]),
    currency: z.enum(CURRENCIES).optional(),
    memberIds: z.array(uuid).max(100),
    newManual: manual,
  }),
  (input, ctx) => createGroup(ctx, { ...input, id: input.id ?? newId() }),
);

export const addGroupMembers = action(
  z.object({ groupId: uuid, memberIds: z.array(uuid).max(100), newManual: manual }),
  (input, ctx) => addMembers(ctx, input),
);

export const respondInvite = action(z.object({ groupId: uuid, accept: z.boolean() }), (input, ctx) =>
  respondGroupInvite(ctx, input),
);

export const rename = action(z.object({ groupId: uuid, name: z.string().min(1).max(60) }), (input, ctx) =>
  renameGroup(ctx, input),
);

export const setRole = action(
  z.object({ groupId: uuid, partyId: uuid, role: z.enum(["ADMIN", "MEMBER"]) }),
  (input, ctx) => setMemberRole(ctx, input),
);

export const kick = action(z.object({ groupId: uuid, partyId: uuid }), (input, ctx) => removeMember(ctx, input));
export const leave = action(z.object({ groupId: uuid }), (input, ctx) => leaveGroup(ctx, input));
export const changeMode = action(z.object({ groupId: uuid, mode: z.enum(["CONFIRM", "TRUST"]) }), (input, ctx) =>
  proposeModeChange(ctx, input),
);
export const archive = action(z.object({ groupId: uuid }), (input, ctx) => archiveGroup(ctx, input));

export const simplify = action(z.object({ groupId: uuid, currency: z.enum(CURRENCIES) }), (input, ctx) =>
  proposeSimplify(ctx, input),
);
