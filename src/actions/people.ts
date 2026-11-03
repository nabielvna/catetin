"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { EMAIL_MAX, NAME_MAX } from "@/domain/people";
import { newId } from "@/lib/server/ids";
import { mergeContact } from "@/services/invites";
import { setBlocked } from "@/services/people/blocks";
import {
  createManualContact,
  deleteManualContact,
  renamePerson,
  setContactArchived,
  setContactEmail,
} from "@/services/people/mutations";
import { remindPerson } from "@/services/people/remind";
import { setTrust } from "@/services/people/trust";

const uuid = z.uuid();

export const addPerson = action(
  z.object({ id: uuid.optional(), name: z.string().min(1).max(NAME_MAX), email: z.string().max(EMAIL_MAX).nullish() }),
  (input, ctx) => createManualContact(ctx, { id: input.id ?? newId(), name: input.name, email: input.email }),
);

export const rename = action(z.object({ partyId: uuid, name: z.string().min(1).max(NAME_MAX) }), (input, ctx) =>
  renamePerson(ctx, input),
);

export const setEmail = action(z.object({ partyId: uuid, email: z.string().max(EMAIL_MAX).nullable() }), (input, ctx) =>
  setContactEmail(ctx, input),
);

export const trust = action(z.object({ partyId: uuid, on: z.boolean() }), (input, ctx) => setTrust(ctx, input));

export const block = action(z.object({ partyId: uuid, blocked: z.boolean() }), (input, ctx) => setBlocked(ctx, input));

export const merge = action(z.object({ sourceId: uuid, targetId: uuid }), (input, ctx) => mergeContact(ctx, input));

export const removeContact = action(z.object({ partyId: uuid }), (input, ctx) => deleteManualContact(ctx, input));

export const archiveContact = action(z.object({ partyId: uuid, archived: z.boolean() }), (input, ctx) =>
  setContactArchived(ctx, input),
);

export const remind = action(z.object({ partyId: uuid }), (input, ctx) => remindPerson(ctx, input));
