import "server-only";

import { z } from "zod";

import { DomainError } from "@/domain/errors";
import { requestAppUrl } from "@/lib/server/app-url";
import { need, reviewOnly } from "@/services/assistant/operations/helpers";
import { uuid } from "@/services/assistant/operations/schemas";
import { type Env, type Op } from "@/services/assistant/operations/types";
import { createInvite, mergeContact, revokeInvite } from "@/services/invites";
import { setBlocked } from "@/services/people/blocks";
import { deleteManualContact, setContactArchived } from "@/services/people/mutations";
import { type PersonCore, personCore } from "@/services/people/queries";
import { remindPerson } from "@/services/people/remind";
import { setTrust } from "@/services/people/trust";

export const managePersonInput = z.object({
  action: z
    .enum([
      "ADD",
      "RENAME",
      "SET_EMAIL",
      "TRUST",
      "UNTRUST",
      "BLOCK",
      "UNBLOCK",
      "MERGE",
      "ARCHIVE",
      "UNARCHIVE",
      "DELETE",
      "REMIND",
      "INVITE_LINK",
      "CANCEL_INVITE",
    ])
    .describe(
      "ADD add a manual contact; RENAME rename (my nickname); SET_EMAIL manual contact email; TRUST/UNTRUST mutual trust (app users only); BLOCK/UNBLOCK; MERGE merge a duplicate manual contact into someone else; ARCHIVE/UNARCHIVE/DELETE manual contact; REMIND remind/ask to pay; INVITE_LINK create an invite link (manual contact partyId = invite to claim records, no partyId = invite a friend to connect); CANCEL_INVITE cancel an invite",
    ),
  partyId: uuid.optional().describe("the person (all actions except ADD; optional for INVITE_LINK)"),
  name: z.string().min(1).max(60).optional().describe("ADD/RENAME: nama"),
  email: z.email().max(254).optional().describe("ADD/SET_EMAIL"),
  clearEmail: z.boolean().optional().describe("SET_EMAIL: true = remove the email"),
  intoPartyId: uuid.optional().describe("MERGE: target person (partyId's records move here)"),
  sendEmail: z.boolean().optional().describe("INVITE_LINK: also send via the contact's email (if any)"),
});
export type ManagePersonInput = z.infer<typeof managePersonInput>;

async function person(env: Env, id: string | undefined, field = "partyId"): Promise<PersonCore> {
  const p = await personCore(env.actor, need(id, field));
  if (!p || p.partyId === env.actor.partyId) throw new DomainError("NOT_FOUND", { field });
  return p;
}

async function inviteUrl(token: string) {
  return `${await requestAppUrl()}/invite/${token}`;
}

export const managePerson: Op<ManagePersonInput> = {
  review(i) {
    if (i.action === "ADD") return { form: "/people/new" };
    if ((i.action === "RENAME" || i.action === "SET_EMAIL") && i.partyId)
      return { form: `/people/${i.partyId}`, view: `/people/${i.partyId}` };
    return null;
  },

  async preview(i, env) {
    const { t } = env;
    if (i.action === "ADD") {
      const name = need(i.name, "name");
      return { title: t("person.add"), lines: [name, ...(i.email ? [i.email] : [])], confirm: t("confirm.save") };
    }
    if (i.action === "INVITE_LINK" && !i.partyId) {
      return { title: t("person.connectLink"), lines: [t("person.connectLinkLine")], confirm: t("confirm.makeLink") };
    }
    const p = await person(env, i.partyId);
    const who = p.name;
    switch (i.action) {
      case "RENAME":
        return { title: t("person.rename"), lines: [`${who} → ${need(i.name, "name")}`], confirm: t("confirm.save") };
      case "SET_EMAIL":
        if (!p.isMyManualContact) throw new DomainError("INVALID_STATE", { reason: "only manual contacts" });
        return {
          title: t("person.email"),
          lines: [who, i.clearEmail ? "–" : need(i.email, "email")],
          confirm: t("confirm.save"),
        };
      case "TRUST":
        if (p.state !== "USER") throw new DomainError("INVALID_STATE", { reason: "only app users" });
        return {
          title: t("person.trust"),
          lines: [who, t("person.trustLine", { name: who })],
          confirm: t("confirm.trust"),
        };
      case "UNTRUST":
        return { title: t("person.untrust"), lines: [who, t("person.untrustLine")], confirm: t("confirm.save") };
      case "BLOCK":
        return {
          title: t("person.block"),
          lines: [who],
          danger: t("person.blockDanger", { name: who }),
          confirm: t("confirm.block"),
        };
      case "UNBLOCK":
        return { title: t("person.unblock"), lines: [who], confirm: t("confirm.unblock") };
      case "MERGE": {
        if (!p.isMyManualContact)
          throw new DomainError("INVALID_STATE", { reason: "source must be my manual contact" });
        const into = await person(env, i.intoPartyId, "intoPartyId");
        return {
          title: t("person.merge"),
          lines: [`${who} → ${into.name}`],
          danger:
            into.state === "USER"
              ? t("person.mergeUserDanger", { name: into.name })
              : t("person.mergeDanger", { from: who, to: into.name }),
          confirm: t("confirm.merge"),
        };
      }
      case "ARCHIVE":
      case "UNARCHIVE":
        if (!p.isMyManualContact) throw new DomainError("INVALID_STATE", { reason: "only manual contacts" });
        return {
          title: t(i.action === "ARCHIVE" ? "person.archive" : "person.unarchive"),
          lines: [who],
          confirm: t("confirm.save"),
        };
      case "DELETE":
        if (!p.isMyManualContact) throw new DomainError("INVALID_STATE", { reason: "only manual contacts" });
        return {
          title: t("person.delete"),
          lines: [who],
          danger: t("person.deleteDanger"),
          confirm: t("confirm.delete"),
        };
      case "REMIND":
        return {
          title: t("person.remind"),
          lines: [t("person.remindLine", { name: who })],
          confirm: t("confirm.send"),
        };
      case "INVITE_LINK":
        if (!p.isMyManualContact) throw new DomainError("INVALID_STATE", { reason: "already an app user" });
        return {
          title: t("person.claimLink"),
          lines: [t("person.claimLinkLine", { name: who }), ...(i.sendEmail && p.email ? [`✉ ${p.email}`] : [])],
          confirm: t("confirm.makeLink"),
        };
      case "CANCEL_INVITE":
        return { title: t("person.cancelInvite"), lines: [who], confirm: t("confirm.save") };
    }
  },

  async run(i, ctx, env) {
    const { t } = env;
    const done = t("done.saved");
    if (i.action === "INVITE_LINK" && !i.partyId) {
      const inv = await createInvite(ctx, { kind: "CONNECT" });
      return { summary: t("done.link"), link: await inviteUrl(inv.token) };
    }
    const p = await person(env, i.partyId);
    const partyId = p.partyId;
    const href = `/people/${partyId}`;
    const undo = (action: ManagePersonInput["action"], extra: Record<string, unknown> = {}) => ({
      tool: "managePerson",
      input: { action, partyId, ...extra },
    });
    switch (i.action) {
      case "TRUST": {
        const r = await setTrust(ctx, { partyId, on: true });
        return {
          summary: t(r.state === "ON" ? "done.trustOn" : "done.trustAsked", { name: p.name }),
          status: r.state,
          href,
          undo: undo("UNTRUST"),
        };
      }
      case "UNTRUST":
        await setTrust(ctx, { partyId, on: false });
        return { summary: done, href, undo: undo("TRUST") };
      case "BLOCK":
        await setBlocked(ctx, { partyId, blocked: true });
        return { summary: t("done.blocked"), href, undo: undo("UNBLOCK") };
      case "UNBLOCK":
        await setBlocked(ctx, { partyId, blocked: false });
        return { summary: done, href, undo: undo("BLOCK") };
      case "MERGE": {
        const into = need(i.intoPartyId, "intoPartyId");
        const r = await mergeContact(ctx, { sourceId: partyId, targetId: into });
        return {
          summary: t(r.status === "PROPOSED" ? "done.mergeProposed" : "done.merged"),
          status: r.status,
          href: `/people/${into}`,
        };
      }
      case "ARCHIVE":
        await setContactArchived(ctx, { partyId, archived: true });
        return { summary: t("done.archived"), href, undo: undo("UNARCHIVE") };
      case "UNARCHIVE":
        await setContactArchived(ctx, { partyId, archived: false });
        return { summary: done, href, undo: undo("ARCHIVE") };
      case "DELETE":
        await deleteManualContact(ctx, { partyId });
        return { summary: t("done.deleted") };
      case "REMIND": {
        const r = await remindPerson(ctx, { partyId });
        return { summary: t(r.sent ? "done.reminded" : "done.remindSkipped", { name: p.name }), href };
      }
      case "INVITE_LINK": {
        const inv = await createInvite(ctx, { kind: "CLAIM", partyId, sendEmail: i.sendEmail });
        return { summary: t("done.link"), link: await inviteUrl(inv.token), href };
      }
      case "CANCEL_INVITE":
        await revokeInvite(ctx, { partyId });
        return { summary: done, href };
    }
    return reviewOnly();
  },
};
