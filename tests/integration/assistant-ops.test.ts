import { generateText, isStepCount, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { groups } from "@/database/schema/groups";
import { obligationLabel } from "@/database/schema/labels";
import { party } from "@/database/schema/people";
import { profile } from "@/database/schema/users";
import { newId } from "@/lib/server/ids";
import { contactsFor } from "@/services/assistant/context";
import { approvalPolicy, makeEnv, opTools, parseUndo, runOp } from "@/services/assistant/operations";
import type { Ctx } from "@/services/context";
import { createGroup } from "@/services/groups/mutations";

import { connected, debt, makeUser, manual, obligationRow, pendingFor, record } from "../helpers/factories";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

async function envFor(ctx: Ctx) {
  return makeEnv(ctx.actor, await contactsFor(ctx.actor));
}

const policy = async (ctx: Ctx, toolName: string, input: unknown) =>
  approvalPolicy(await envFor(ctx))({ toolCall: { toolName, input } });

describe("assistant: actions with a confirmation card (D-92)", () => {
  it("preview becomes a card; dangerous actions list consequences; bad data is auto-rejected with a reason", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const ob = await record(andi, debt(andi, eko.partyId, 50_000, { title: "Makan" }));

    const edit = await policy(andi, "manageDebt", { action: "EDIT", debtId: ob.id, amount: 75_000 });
    expect(edit).toMatchObject({ type: "user-approval" });
    const preview = JSON.parse((edit as { reason: string }).reason);
    expect(preview.lines.join(" ")).toContain("75.000");
    expect(preview.danger).toBeUndefined();

    expect(preview.review).toBe(`/debts/${ob.id}/edit`);

    const del = await policy(andi, "manageDebt", { action: "DELETE", debtId: ob.id });
    expect(JSON.parse((del as { reason: string }).reason).danger).toBeTruthy();
    expect(JSON.parse((del as { reason: string }).reason).review).toBeUndefined();

    const bad = await policy(andi, "manageDebt", { action: "DELETE", debtId: "0199aaaa-0000-7000-8000-000000000000" });
    expect(bad).toMatchObject({ type: "denied" });
    expect((bad as { reason: string }).reason).toContain("debtId");

    const missing = await policy(andi, "managePerson", { action: "RENAME", partyId: eko.partyId });
    expect((missing as { reason: string }).reason).toContain("name");

    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const mine = await record(andi, debt(budi, andi, 10_000));
    expect(await policy(andi, "manageDebt", { action: "FORGIVE", debtId: mine.id })).toMatchObject({ type: "denied" });

    expect(await policy(andi, "respondRequest", { action: "MARK_READ" })).toBe("not-applicable");

    expect(await policy(andi, "findPerson", { name: "eko" })).toBeUndefined();
  });

  it("full flow: model calls a tool → card → approved → run by the server; forged approvals are rejected", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const contacts = await contactsFor(andi.actor);
    const { tools, env } = opTools(andi.actor, contacts);
    const secret = "test-approval-secret-0123456789abcdef";
    const input = { action: "ARCHIVE", partyId: eko.partyId };
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        call++;
        if (call === 1) {
          return {
            content: [{ type: "tool-call", toolCallId: "t1", toolName: "managePerson", input: JSON.stringify(input) }],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          };
        }
        return {
          content: [{ type: "text", text: "Eko sudah diarsipkan." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    });
    const base = {
      model,
      tools,
      toolApproval: approvalPolicy(env),
      experimental_toolApprovalSecret: secret,
      stopWhen: isStepCount(4),
    };
    const first = await generateText({ ...base, prompt: "arsipkan eko" });
    const request = first.content.find((p) => p.type === "tool-approval-request");
    expect(request).toBeTruthy();

    const [before] = await db.select().from(party).where(eq(party.id, eko.partyId));
    expect(before!.archivedAt).toBeNull();

    const approvalId = (request as { approvalId: string }).approvalId;
    const messages: ModelMessage[] = [
      { role: "user", content: "arsipkan eko" },
      ...first.responseMessages,
      { role: "tool", content: [{ type: "tool-approval-response", approvalId, approved: true }] },
    ];
    const second = await generateText({ ...base, messages });

    const results = JSON.stringify(second.responseMessages.filter((message) => message.role === "tool"));
    expect(results).toContain('"ok":true');
    expect(results).toContain("UNARCHIVE");
    const [after] = await db.select().from(party).where(eq(party.id, eko.partyId));
    expect(after!.archivedAt).not.toBeNull();

    const other = await manual(andi, "Fajar");
    const forged = JSON.parse(JSON.stringify(first.responseMessages)) as ModelMessage[];
    for (const m of forged) {
      if (typeof m.content === "string") continue;
      for (const p of m.content as Array<{ type: string; input?: unknown }>) {
        if (p.type === "tool-call") p.input = { action: "ARCHIVE", partyId: other.partyId };
      }
    }
    call = 0;
    await expect(
      generateText({
        ...base,
        messages: [
          { role: "user", content: "arsipkan eko" },
          ...forged,
          { role: "tool", content: [{ type: "tool-approval-response", approvalId, approved: true }] },
        ],
      }),
    ).rejects.toThrow();
    const [fajar] = await db.select().from(party).where(eq(party.id, other.partyId));
    expect(fajar!.archivedAt).toBeNull();
  });

  it("D-104: creates/edits carrying data go through Review — 'approve' from its card changes nothing", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const ob = await record(andi, debt(andi, eko.partyId, 50_000, { title: "Bensin" }));
    const env = await envFor(andi);
    const review = async (name: Parameters<typeof runOp>[0], input: unknown) => {
      const p = await approvalPolicy(env)({ toolCall: { toolName: name, input } });
      return JSON.parse((p as { reason: string }).reason).review as string | undefined;
    };

    expect(await review("manageDebt", { action: "SET_LABELS", debtId: ob.id, labels: ["kantor"] })).toBe(
      `/debts/${ob.id}`,
    );
    expect(await review("managePayment", { action: "OFFSET", partyId: eko.partyId, amount: 1_000 })).toBe(
      `/payments/new?with=${eko.partyId}&kind=offset&currency=IDR`,
    );
    expect(await review("managePerson", { action: "ADD", name: "Gilang" })).toBe("/people/new");
    expect(await review("managePerson", { action: "SET_EMAIL", partyId: eko.partyId, email: "e@x.id" })).toBe(
      `/people/${eko.partyId}`,
    );
    expect(await review("manageGroup", { action: "CREATE", name: "Kos" })).toBe("/groups/new");
    expect(await review("updateSettings", { action: "QUIET_HOURS", quietStart: 22, quietEnd: 7 })).toBe(
      "/account/notifications",
    );
    expect(await review("updateSettings", { action: "FEEDBACK", message: "mantap" })).toBe("/account");

    expect(await review("updateSettings", { action: "DIGEST", digest: "OFF" })).toBeUndefined();
    expect(await review("manageDebt", { action: "FORGIVE", debtId: ob.id, amount: 1_000 })).toBeUndefined();

    expect(
      await review("manageDebt", {
        action: "EDIT",
        debtId: ob.id,
        installments: { count: 2, every: "MONTH", firstDue: "2026-10-27" },
      }),
    ).toBeUndefined();

    expect(
      await approvalPolicy(env)({
        toolCall: { toolName: "updateSettings", input: { action: "PROFILE", name: "A", currency: "USD" } },
      }),
    ).toMatchObject({ type: "denied" });

    expect(
      await runOp("manageDebt", { action: "EDIT", debtId: ob.id, amount: 60_000, title: "Bensin PP" }, env),
    ).toMatchObject({ ok: true, reviewed: true, href: `/debts/${ob.id}` });
    expect(await obligationRow(ob.id)).toMatchObject({ amount: 50_000, title: "Bensin" });
    expect(await runOp("manageDebt", { action: "SET_LABELS", debtId: ob.id, labels: ["kantor"] }, env)).toMatchObject({
      ok: true,
      reviewed: true,
    });
    expect(await db.select().from(obligationLabel).where(eq(obligationLabel.obligationId, ob.id))).toHaveLength(0);
    expect(await runOp("managePerson", { action: "RENAME", partyId: eko.partyId, name: "Eko P" }, env)).toMatchObject({
      reviewed: true,
    });
    const [p] = await db.select().from(party).where(eq(party.id, eko.partyId));
    expect(p!.displayName).toBe("Eko");
    const created = await runOp("manageGroup", { action: "CREATE", name: "Kos" }, env);
    expect(created).toMatchObject({ ok: true, reviewed: true });
    expect((created as { href?: string }).href).toBeUndefined();
  });

  it("debts: change installments, forgive, delete via the same use-cases as the app", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const ob = await record(andi, debt(andi, eko.partyId, 50_000));
    const env = await envFor(andi);

    expect(
      await runOp(
        "manageDebt",
        { action: "EDIT", debtId: ob.id, installments: { count: 2, every: "MONTH", firstDue: "2026-10-27" } },
        env,
      ),
    ).toMatchObject({ ok: true, status: "APPLIED" });
    expect((await obligationRow(ob.id)).installments).toMatchObject({ count: 2 });

    expect(await runOp("manageDebt", { action: "FORGIVE", debtId: ob.id, amount: 10_000 }, env)).toMatchObject({
      ok: true,
    });
    expect((await obligationRow(ob.id)).paid).toBe(10_000);

    expect(await runOp("manageDebt", { action: "DELETE", debtId: ob.id }, env)).toMatchObject({
      ok: false,
      code: "HAS_PAYMENTS",
    });
    const ob2 = await record(andi, debt(andi, eko.partyId, 5_000));
    expect(await runOp("manageDebt", { action: "DELETE", debtId: ob2.id }, env)).toMatchObject({ ok: true });
    expect((await obligationRow(ob2.id)).status).toBe("VOID");
  });

  it("requests: approve many at once from the inbox", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const a = await record(budi, debt(budi, andi, 20_000));
    const b = await record(budi, debt(budi, andi, 30_000));
    const ids = [await pendingFor(andi, a.id), await pendingFor(andi, b.id)] as string[];
    expect(ids.every(Boolean)).toBe(true);

    const env = await envFor(andi);
    const p = await approvalPolicy(env)({
      toolCall: { toolName: "respondRequest", input: { action: "APPROVE", requestIds: ids } },
    });
    expect(JSON.parse((p as { reason: string }).reason).lines).toHaveLength(2);
    expect(await runOp("respondRequest", { action: "APPROVE", requestIds: ids }, env)).toMatchObject({ ok: true });
    expect((await obligationRow(a.id)).status).toBe("ACTIVE");
    expect((await obligationRow(b.id)).status).toBe("ACTIVE");
  });

  it("groups & people & settings; undo only for reversible actions", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const env = await envFor(andi);

    const { id: groupId } = await createGroup(andi, {
      id: newId(),
      name: "Kos",
      mode: "CONFIRM",
      memberIds: [eko.partyId],
      newManual: [],
    });
    const mode = await runOp("manageGroup", { action: "CHANGE_MODE", groupId, mode: "TRUST" }, env);
    expect(mode).toMatchObject({ ok: true });
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
    expect(g!.mode).toBe("TRUST");

    const archived = await runOp(
      "managePerson",
      { action: "ARCHIVE", partyId: (await manual(andi, "Dodi")).partyId },
      env,
    );
    const undo = parseUndo("managePerson", (archived as { undo: { input: unknown } }).undo.input)!;
    expect(await runOp(undo.name, undo.input, env)).toMatchObject({ ok: true });

    const link = await runOp("managePerson", { action: "INVITE_LINK", partyId: eko.partyId }, env);
    expect((link as { link: string }).link).toMatch(/\/invite\//);

    const digest = await runOp("updateSettings", { action: "DIGEST", digest: "OFF" }, env);
    expect(digest).toMatchObject({ ok: true, undo: { input: { digest: "WEEKLY" } } });
    const [p] = await db.select().from(profile).where(eq(profile.userId, andi.actor.userId));
    expect(p!.digest).toBe("OFF");

    expect(parseUndo("manageDebt", { action: "DELETE", debtId: eko.partyId })).toBeNull();
    expect(parseUndo("updateSettings", { action: "PROFILE", locale: "en" })).toBeNull();
    expect(parseUndo("updateSettings", { action: "PROFILE", name: "Andi X" })).toBeNull();
    expect(parseUndo("managePerson", { action: "RENAME", partyId: eko.partyId, name: "X" })).toBeNull();
    expect(parseUndo("findPerson", { name: "x" })).toBeNull();
  });

  it("one tap = runs once: a resent request doesn't run the action twice", async () => {
    const andi = await makeUser("Andi");
    const eko = await manual(andi, "Eko");
    const env = await envFor(andi);
    const input = { action: "ARCHIVE", partyId: eko.partyId };
    expect(await runOp("managePerson", input, env, "call-once")).toMatchObject({ ok: true });
    expect(await runOp("managePerson", { action: "UNARCHIVE", partyId: eko.partyId }, env, "call-once")).toMatchObject({
      ok: false,
      code: "ALREADY_DECIDED",
    });
    const [p] = await db.select().from(party).where(eq(party.id, eko.partyId));
    expect(p!.archivedAt).not.toBeNull();
  });
});
