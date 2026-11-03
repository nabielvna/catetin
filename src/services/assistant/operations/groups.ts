import "server-only";

import { z } from "zod";

import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { requestAppUrl } from "@/lib/server/app-url";
import { need, reviewOnly } from "@/services/assistant/operations/helpers";
import { currencyCode, personRef, uuid } from "@/services/assistant/operations/schemas";
import { type Env, type Op } from "@/services/assistant/operations/types";
import {
  archiveGroup,
  leaveGroup,
  proposeModeChange,
  removeMember,
  respondGroupInvite,
  setMemberRole,
} from "@/services/groups/mutations";
import { getGroupDetail, type GroupDetail, listMyGroups } from "@/services/groups/queries";
import { proposeSimplify, simplifyPreview } from "@/services/groups/simplify";
import { createInvite, revokeInvite } from "@/services/invites";

export const manageGroupInput = z.object({
  action: z
    .enum([
      "CREATE",
      "ADD_MEMBERS",
      "ACCEPT_INVITE",
      "DECLINE_INVITE",
      "RENAME",
      "SET_ROLE",
      "REMOVE_MEMBER",
      "LEAVE",
      "CHANGE_MODE",
      "ARCHIVE",
      "SIMPLIFY",
      "INVITE_LINK",
      "CANCEL_INVITES",
    ])
    .describe(
      "CREATE create a group; ADD_MEMBERS add members; ACCEPT_INVITE/DECLINE_INVITE a group invite for me; RENAME; SET_ROLE admin/member; REMOVE_MEMBER remove a member; LEAVE leave the group; CHANGE_MODE needs confirmation/trusted; ARCHIVE archive (balance must be zero, can't be reopened); SIMPLIFY simplify group debts; INVITE_LINK group invite link; CANCEL_INVITES cancel group invite links",
    ),
  groupId: uuid.optional().describe("the group (all actions except CREATE)"),
  name: z.string().min(1).max(60).optional().describe("CREATE/RENAME: group name"),
  mode: z
    .enum(["CONFIRM", "TRUST"])
    .optional()
    .describe(
      "CREATE/CHANGE_MODE: CONFIRM = every record needs confirmation, TRUST = trusted group (takes effect immediately)",
    ),
  currency: currencyCode.optional().describe("CREATE: group currency; SIMPLIFY: currency to simplify"),
  members: z.array(personRef).max(50).optional().describe("CREATE/ADD_MEMBERS: anggota"),
  partyId: uuid.optional().describe("SET_ROLE/REMOVE_MEMBER: anggotanya"),
  role: z.enum(["ADMIN", "MEMBER"]).optional().describe("SET_ROLE"),
});
export type ManageGroupInput = z.infer<typeof manageGroupInput>;

async function group(env: Env, id: string | undefined): Promise<GroupDetail> {
  const g = await getGroupDetail(env.actor, need(id, "groupId"));
  if (!g) throw new DomainError("NOT_FOUND", { field: "groupId" });
  return g;
}

function memberNames(i: ManageGroupInput, env: Env) {
  return need(i.members, "members")
    .map((m) => (m.partyId ? env.nameOf(m.partyId) : `${m.newPersonName} (${env.t("newPerson")})`))
    .join(", ");
}

async function inviteUrl(token: string) {
  return `${await requestAppUrl()}/invite/${token}`;
}

export const manageGroup: Op<ManageGroupInput> = {
  review(i) {
    if (i.action === "CREATE") return { form: "/groups/new" };
    if ((i.action === "RENAME" || i.action === "ADD_MEMBERS") && i.groupId)
      return { form: `/groups/${i.groupId}`, view: `/groups/${i.groupId}` };
    return null;
  },

  async preview(i, env) {
    const { t } = env;
    if (i.action === "CREATE") {
      return {
        title: t("group.create"),
        lines: [
          need(i.name, "name"),
          t(`mode.${i.mode ?? "CONFIRM"}`),
          ...(i.members?.length ? [`${t("field.members")}: ${memberNames(i, env)}`] : []),
        ],
        confirm: t("confirm.create"),
      };
    }
    if (i.action === "ACCEPT_INVITE" || i.action === "DECLINE_INVITE") {
      const id = need(i.groupId, "groupId");
      const g = (await listMyGroups(env.actor)).find((x) => x.id === id && x.myStatus === "INVITED");
      if (!g) throw new DomainError("NOT_FOUND", { field: "groupId" });
      return {
        title: t(i.action === "ACCEPT_INVITE" ? "group.accept" : "group.decline"),
        lines: [g.name, ...(g.invitedBy ? [t("group.invitedBy", { name: g.invitedBy })] : []), t(`mode.${g.mode}`)],
        confirm: t(i.action === "ACCEPT_INVITE" ? "confirm.join" : "confirm.decline"),
      };
    }
    const g = await group(env, i.groupId);
    const member = (id: string | undefined) => {
      const m = g.members.find((x) => x.partyId === need(id, "partyId") && x.status === "ACTIVE");
      if (!m) throw new DomainError("NOT_GROUP_MEMBER", { field: "partyId" });
      return m;
    };
    switch (i.action) {
      case "ADD_MEMBERS":
        if (!need(i.members, "members").some((m) => m.partyId || m.newPersonName))
          throw new DomainError("INVALID_INPUT", { field: "members" });
        return { title: t("group.addMembers"), lines: [g.name, memberNames(i, env)], confirm: t("confirm.add") };
      case "RENAME":
        return { title: t("group.rename"), lines: [`${g.name} → ${need(i.name, "name")}`], confirm: t("confirm.save") };
      case "SET_ROLE": {
        const m = member(i.partyId);
        return {
          title: t("group.setRole"),
          lines: [g.name, `${m.name}: ${t(`role.${need(i.role, "role")}`)}`],
          confirm: t("confirm.save"),
        };
      }
      case "REMOVE_MEMBER": {
        const m = member(i.partyId);
        return {
          title: t("group.remove"),
          lines: [g.name, m.name],
          danger: t("group.removeDanger", { name: m.name }),
          confirm: t("confirm.remove"),
        };
      }
      case "LEAVE":
        return {
          title: t("group.leave"),
          lines: [g.name],
          danger: t("group.leaveDanger"),
          confirm: t("confirm.leave"),
        };
      case "CHANGE_MODE":
        return {
          title: t("group.mode"),
          lines: [g.name, `${t(`mode.${g.mode}`)} → ${t(`mode.${need(i.mode, "mode")}`)}`],
          confirm: t("confirm.save"),
        };
      case "ARCHIVE":
        return {
          title: t("group.archive"),
          lines: [g.name],
          danger: t("group.archiveDanger"),
          confirm: t("confirm.archive"),
        };
      case "SIMPLIFY": {
        const all = await simplifyPreview(env.actor, g.id);
        const p = i.currency ? all.find((x) => x.currency === i.currency) : all[0];
        if (!p || p.simplified >= p.current) throw new DomainError("INVALID_STATE", { reason: "nothing to simplify" });
        return {
          title: t("group.simplify"),
          lines: [
            t("group.simplifyLine", { from: p.current, to: p.simplified }),
            ...p.transfers.slice(0, 8).map((x) => `${x.fromName} → ${x.toName}: ${env.fmt(x.amount, p.currency)}`),
          ],
          confirm: t("confirm.propose"),
        };
      }
      case "INVITE_LINK":
        return { title: t("group.inviteLink"), lines: [g.name], confirm: t("confirm.makeLink") };
      case "CANCEL_INVITES":
        return { title: t("group.cancelInvites"), lines: [g.name], confirm: t("confirm.save") };
    }
  },

  async run(i, ctx, env) {
    const { t } = env;
    const done = t("done.saved");
    const groupId = need(i.groupId, "groupId");
    const href = `/groups/${groupId}`;
    switch (i.action) {
      case "ACCEPT_INVITE":
      case "DECLINE_INVITE": {
        const r = await respondGroupInvite(ctx, { groupId, accept: i.action === "ACCEPT_INVITE" });
        return { summary: done, status: r.status, href: i.action === "ACCEPT_INVITE" ? href : "/groups" };
      }
      case "SET_ROLE":
        await setMemberRole(ctx, { groupId, partyId: need(i.partyId, "partyId"), role: need(i.role, "role") });
        return { summary: done, href };
      case "REMOVE_MEMBER":
        await removeMember(ctx, { groupId, partyId: need(i.partyId, "partyId") });
        return { summary: done, href };
      case "LEAVE":
        await leaveGroup(ctx, { groupId });
        return { summary: t("done.left"), href: "/groups" };
      case "CHANGE_MODE": {
        const r = await proposeModeChange(ctx, { groupId, mode: need(i.mode, "mode") });
        return { summary: t(r.status === "PROPOSED" ? "done.proposed" : "done.saved"), status: r.status, href };
      }
      case "ARCHIVE":
        await archiveGroup(ctx, { groupId });
        return { summary: t("done.archived"), href };
      case "SIMPLIFY": {
        const g = await group(env, groupId);
        const all = await simplifyPreview(env.actor, groupId);
        const currency = (i.currency ?? all[0]?.currency ?? g.currency) as Currency;
        const r = await proposeSimplify(ctx, { groupId, currency });
        return { summary: t(r.status === "APPLIED" ? "done.saved" : "done.proposed"), status: r.status, href };
      }
      case "INVITE_LINK": {
        const inv = await createInvite(ctx, { kind: "GROUP", groupId });
        return { summary: t("done.link"), link: await inviteUrl(inv.token), href };
      }
      case "CANCEL_INVITES":
        await revokeInvite(ctx, { groupId });
        return { summary: done, href };
    }
    return reviewOnly();
  },
};
