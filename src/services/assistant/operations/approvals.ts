import "server-only";

import { z } from "zod";

import { db } from "@/database/client";
import { DomainError } from "@/domain/errors";
import { cancelRequest, decideRequest } from "@/services/approvals/decisions";
import { disputeTrustAction, listDisputable } from "@/services/approvals/disputes";
import { listAwaiting, listWaiting, type RequestItem } from "@/services/approvals/queries";
import { need } from "@/services/assistant/operations/helpers";
import { uuid } from "@/services/assistant/operations/schemas";
import { type Env, type Op } from "@/services/assistant/operations/types";
import { markRead } from "@/services/notifications/enqueue";

export const respondRequestInput = z.object({
  action: z
    .enum(["APPROVE", "REJECT", "CANCEL", "DISPUTE", "MARK_READ"])
    .describe(
      "APPROVE/REJECT requests awaiting my decision; CANCEL withdraw my own request; DISPUTE dispute a mutual-trust/trusted-group action (7 days); MARK_READ mark all notifications read",
    ),
  requestIds: z.array(uuid).min(1).max(50).optional().describe("request ids from getInbox (APPROVE/REJECT/CANCEL)"),
  disputeId: uuid.optional().describe("id from getInbox → disputable (DISPUTE)"),
  reason: z.string().max(500).optional().describe("reason for rejecting/disputing (optional)"),
});
export type RespondRequestInput = z.infer<typeof respondRequestInput>;

function requestLine(r: RequestItem, env: Env) {
  const amount = r.amount !== null && r.currency ? ` · ${env.fmt(r.amount, r.currency)}` : "";
  const what = r.title ?? r.groupName;
  return `${env.t(`request.${r.displayKind}`)}${what ? `: ${what}` : ""}${amount} · ${r.requesterName}`;
}

async function pick(i: RespondRequestInput, env: Env) {
  const ids = need(i.requestIds, "requestIds");
  const pool = i.action === "CANCEL" ? await listWaiting(env.actor, 200) : await listAwaiting(env.actor, 200);
  const found = ids.map((id) => pool.find((r) => r.requestId === id));
  const missing = ids.filter((_, k) => !found[k]);
  if (missing.length) throw new DomainError("NOT_FOUND", { field: "requestIds", ids: missing.join(",") });
  return found as RequestItem[];
}

export const respondRequest: Op<RespondRequestInput> = {
  async preview(i, env) {
    const { t } = env;
    if (i.action === "MARK_READ") return "auto";
    if (i.action === "DISPUTE") {
      const id = need(i.disputeId, "disputeId");
      const d = (await listDisputable(env.actor)).find((x) => x.id === id);
      if (!d) throw new DomainError("NOT_FOUND", { field: "disputeId" });
      const amount = d.amount !== null && d.currency ? ` · ${env.fmt(d.amount, d.currency)}` : "";
      return {
        title: t("request.dispute"),
        lines: [
          `${d.title ?? ""}${amount} · ${d.actorName}`,
          ...(i.reason ? [`${t("field.reason")}: ${i.reason}`] : []),
        ],
        danger: t("request.disputeDanger"),
        confirm: t("confirm.dispute"),
      };
    }
    const items = await pick(i, env);
    const title = t(
      i.action === "APPROVE" ? "request.approve" : i.action === "REJECT" ? "request.reject" : "request.cancel",
      { count: items.length },
    );
    return {
      title,
      lines: [
        ...items.slice(0, 8).map((r) => requestLine(r, env)),
        ...(items.length > 8 ? [t("more", { count: items.length - 8 })] : []),
        ...(i.reason ? [`${t("field.reason")}: ${i.reason}`] : []),
      ],
      confirm: t(
        i.action === "APPROVE" ? "confirm.approve" : i.action === "REJECT" ? "confirm.reject" : "confirm.withdraw",
      ),
    };
  },

  async run(i, ctx, env) {
    const { t } = env;
    if (i.action === "MARK_READ") {
      await markRead(db, ctx.actor.userId, "all");
      return { summary: t("done.saved") };
    }
    if (i.action === "DISPUTE") {
      await disputeTrustAction(ctx, { id: need(i.disputeId, "disputeId"), reason: i.reason ?? null });
      return { summary: t("done.disputed") };
    }
    const items = await pick(i, env);

    const results = await Promise.allSettled(
      items.map((r) =>
        i.action === "CANCEL"
          ? cancelRequest(ctx, { requestId: r.requestId })
          : decideRequest(ctx, { requestId: r.requestId, decision: i.action as "APPROVE", reason: i.reason ?? null }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (ok === 0) throw (results[0] as PromiseRejectedResult).reason;
    return { summary: failed ? t("done.partly", { ok, failed }) : t("done.decided", { count: ok }), href: "/inbox" };
  },
};
