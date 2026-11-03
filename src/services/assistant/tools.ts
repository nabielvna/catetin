import "server-only";

import { type InferUITools, tool, type UIMessage } from "ai";
import { z } from "zod";

import { todayIn } from "@/domain/dates";
import { CATEGORIES } from "@/domain/debt";
import { INSTALLMENTS_MAX, INSTALLMENTS_MIN } from "@/domain/installments";
import { type Currency, currencyExponent, isCurrency } from "@/domain/money";
import { DEFAULT_RECORD_FILTER, filterRecords } from "@/domain/records";
import { DUE_AFTER_MAX } from "@/domain/recurring";
import {
  computePersonStats,
  computeStats,
  type GroupBucket,
  type Habits,
  STAT_PERIODS,
  statCurrencies,
  type StatPeriod,
  type Summary,
} from "@/domain/stats";
import { messagesFor } from "@/i18n/messages";
import { TOUR_IDS, TOURS } from "@/lib/tours";
import { listDisputable } from "@/services/approvals/disputes";
import { listAwaiting, listWaiting } from "@/services/approvals/queries";
import { type Contact, findInContacts } from "@/services/assistant/context";
import type { rescanTool } from "@/services/assistant/photos";
import { billCore, billShares } from "@/services/bills/queries";
import type { Actor } from "@/services/context";
import { getObligationDetail } from "@/services/debts/queries";
import { getGroupDetail, groupEntries, listMyGroups } from "@/services/groups/queries";
import { balanceSummary, dueSoon } from "@/services/home";
import { inboxCounts } from "@/services/notifications/inbox";
import {
  settlementAllocations,
  settlementCore,
  settlementExcess,
  settlementPending,
} from "@/services/payments/queries";
import { getPerson } from "@/services/people/queries";
import { allRecords } from "@/services/records";
import { search } from "@/services/search";
import { statsInput } from "@/services/stats";

import type { OpOutput, opTools } from "./operations";

const major = (minor: number, currency: Currency | string) => minor / 10 ** currencyExponent(currency as Currency);
const majorMap = (m: Partial<Record<string, number>>) =>
  Object.fromEntries(Object.entries(m).map(([c, v]) => [c, major(v ?? 0, c)]));

const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(isCurrency, "unknown currency")
  .describe("ISO 4217 code, e.g. IDR, USD, EUR");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const personRef = z
  .object({
    partyId: z.uuid().optional().describe("partyId of a known person"),
    newPersonName: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("name of a new person (manual contact) if not known yet"),
  })
  .describe("Fill exactly one: partyId or newPersonName");

function draftResult({ output }: { output: { status: "saved" | "cancelled" } & Record<string, unknown> }) {
  if (output.status === "cancelled") {
    return {
      type: "text" as const,
      value:
        "CANCELLED: the user tapped Cancel on this card, nothing was saved. Do not create this card again and do not ask them to tap Save. Reply briefly that it was cancelled, in the language of the user's last message.",
    };
  }

  return { type: "json" as const, value: { ...output, note: "saved by the user in the app form (values may differ)" } };
}

const TOUR_TOOL_DESCRIPTION = [
  "Guide card for HOW-TO QUESTIONS ('gimana cara …', 'how do I …'): manual steps + offer for you to do it + on-screen walkthrough button. Pick an id:",
  ...Object.entries(TOURS).map(
    ([id, t]: [string, { about: string; needs?: string; assist: string | null }]) =>
      `${id}: ${t.about}${t.needs ? ` (needs ${t.needs})` : ""}${t.assist === null ? " (not possible via the assistant)" : ""}`,
  ),
].join("\n");

export const clientTools = {
  draftDebt: tool({
    toModelOutput: draftResult,
    description: "Show a debt draft card; the user checks & saves it in the app form. Saves nothing.",
    inputSchema: z.object({
      person: personRef,
      direction: z.enum(["THEY_OWE", "I_OWE"]),
      amount: z.number().positive().describe("amount in plain units, e.g. 50000"),
      currency: currencyCode.optional(),
      title: z.string().min(1).max(100),
      category: z.enum(CATEGORIES).optional(),
      occurredOn: date.optional(),
      dueOn: date.optional(),
      groupId: z.uuid().optional(),
      note: z.string().max(500).optional(),
      installments: z
        .object({
          count: z.number().int().min(INSTALLMENTS_MIN).max(INSTALLMENTS_MAX),
          every: z.enum(["WEEK", "MONTH"]),
          firstDue: date,
        })
        .optional()
        .describe("installments: number of times, every week/month, first due date"),
      repeat: z
        .object({
          every: z.enum(["WEEK", "MONTH", "YEAR"]),
          dueAfterDays: z.number().int().min(0).max(DUE_AFTER_MAX).optional(),
        })
        .optional()
        .describe("recurring debt (e.g. monthly dues); occurredOn = start date"),
      labels: z.array(z.string().min(1).max(30)).max(10).optional().describe("private labels"),
      attachPhoto: z.boolean().optional().describe("true = attach the latest photo in the chat as proof"),
    }),

    outputSchema: z.object({
      status: z.enum(["saved", "cancelled"]),
      id: z.string().optional(),
      pending: z.boolean().optional(),
      recurring: z.boolean().optional(),
      partyId: z.string().optional(),
      title: z.string().max(100).optional(),
      amount: z.number().optional(),
      currency: z.string().max(3).optional(),
    }),
  }),
  draftPayment: tool({
    toModelOutput: draftResult,
    description: "Show a payment draft card. IN = that person pays the user; OUT = the user pays that person.",
    inputSchema: z.object({
      partyId: z.uuid(),
      direction: z.enum(["IN", "OUT"]),
      amount: z.number().positive().optional().describe("leave empty to settle everything"),
      currency: currencyCode.optional(),
      method: z.enum(["CASH", "TRANSFER", "EWALLET", "OTHER"]).optional(),
      paidOn: date.optional(),
      debtCurrency: currencyCode
        .optional()
        .describe(
          "currency of the debt being settled if different from the payment currency (latest rate used, editable)",
        ),
      allowExcess: z.boolean().optional().describe("true = any excess over the remaining debt becomes a reverse debt"),
      groupId: z.uuid().optional().describe("only settle debts in this group"),
      note: z.string().max(500).optional(),
      attachPhoto: z.boolean().optional().describe("true = attach the latest photo in the chat as proof"),
    }),
    outputSchema: z.object({
      status: z.enum(["saved", "cancelled"]),
      id: z.string().optional(),
      pending: z.boolean().optional(),
      amount: z.number().optional(),
      currency: z.string().max(3).optional(),
    }),
  }),
  draftBill: tool({
    toModelOutput: draftResult,
    description: "Show a split bill draft card (shared bill).",
    inputSchema: z.object({
      title: z.string().min(1).max(100),
      currency: currencyCode.optional(),
      payer: z.union([z.literal("me"), personRef]).describe('"me" if the user paid'),
      participants: z
        .array(z.union([z.literal("me"), personRef]))
        .min(1)
        .max(30),
      mode: z
        .enum(["EQUAL", "ITEMS", "EXACT", "SHARES"])
        .describe("EQUAL evenly; ITEMS per item; EXACT amount per person; SHARES portions per person"),
      subtotal: z.number().positive().optional().describe("required for EQUAL/SHARES without items"),
      exact: z
        .array(z.object({ who: z.string().describe('partyId / "me" / "new:<Name>"'), amount: z.number().min(0) }))
        .max(60)
        .optional()
        .describe("EXACT: base amount per participant (before tax/service)"),
      shares: z
        .array(
          z.object({
            who: z.string().describe('partyId / "me" / "new:<Name>"'),
            shares: z.number().int().min(0).max(1000),
          }),
        )
        .max(60)
        .optional()
        .describe("SHARES: number of portions per participant, e.g. 2 and 1"),
      items: z
        .array(
          z.object({
            name: z.string().min(1).max(100),
            amount: z.number().positive().describe("line total (price × quantity)"),
            assignees: z
              .array(z.string())
              .optional()
              .describe('partyId / "me" / "new:<Name>"; empty = split among all participants'),
          }),
        )
        .max(100)
        .optional(),
      serviceBps: z.number().int().min(0).max(5000).optional().describe("service in basis points, 5% = 500"),
      taxBps: z.number().int().min(0).max(5000).optional().describe("tax in basis points, 10% = 1000"),
      serviceAmount: z
        .number()
        .min(0)
        .optional()
        .describe(
          "exact service amount from the receipt (overrides serviceBps); use this when the receipt prints the amount",
        ),
      taxAmount: z
        .number()
        .min(0)
        .optional()
        .describe(
          "exact tax/PB1/VAT amount from the receipt (overrides taxBps); use this when the receipt prints the amount",
        ),
      discount: z.number().min(0).optional().describe("total discount (positive number)"),
      groupId: z.uuid().optional(),
      occurredOn: date.optional(),
      dueOn: date.optional(),
      attachPhoto: z.boolean().optional().describe("true = attach the latest receipt photo in the chat"),
    }),
    outputSchema: z.object({
      status: z.enum(["saved", "cancelled"]),
      id: z.string().optional(),
      title: z.string().max(100).optional(),
      total: z.number().optional(),
      currency: z.string().max(3).optional(),
    }),
  }),
  askChoice: tool({
    description: "Ask the user to pick with buttons (e.g. an ambiguous name).",
    inputSchema: z.object({
      question: z.string().max(200),
      options: z
        .array(z.object({ label: z.string().max(80), value: z.string().max(120) }))
        .min(2)
        .max(6),
    }),
    outputSchema: z.object({ value: z.string(), label: z.string() }),
  }),
  navigate: tool({
    description: "Open a page in the app for the user.",
    inputSchema: z.object({ path: z.string().startsWith("/").max(200), reason: z.string().max(120).optional() }),
    outputSchema: z.object({ ok: z.boolean() }),
  }),
  showTour: tool({
    description: TOUR_TOOL_DESCRIPTION,
    inputSchema: z.object({
      tour: z.enum(TOUR_IDS),
      partyId: z.uuid().optional().describe("the person, for guides that need partyId"),
      groupId: z.uuid().optional().describe("the group, for guides that need groupId"),
      debtId: z.uuid().optional().describe("the debt, for guides that need debtId"),
      paymentId: z.uuid().optional().describe("the payment, for guides that need paymentId"),
    }),
    outputSchema: z.object({ ok: z.boolean() }),

    toModelOutput: () => ({
      type: "text" as const,
      value:
        "Guide card shown: it already introduces the options, lists the manual steps, offers that you can do it for them, and has a 'Guide me' button. Do not repeat or summarize any of it and do not add a closing sentence: end your turn with no further text.",
    }),
  }),
  offerDownload: tool({
    description:
      "Show a download button: PERSON_PDF PDF report with one person, PERSON_CSV records with one person (CSV), ALL_DATA all my account data (JSON).",
    inputSchema: z.object({
      kind: z.enum(["PERSON_PDF", "PERSON_CSV", "ALL_DATA"]),
      partyId: z.uuid().optional().describe("required for PERSON_PDF/PERSON_CSV"),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
  }),
};

const LIST_MAX = 60;
const LIST_BATCH = 8;

export function serverTools(actor: Actor, contacts: Contact[]) {
  return {
    findPerson: tool({
      description: "Find people by name/nickname (tolerant of spelling & sound). Use before any draft.",
      inputSchema: z.object({ name: z.string().min(1).max(60) }),
      execute: async ({ name }) => findInContacts(contacts, name),
    }),
    getBalances: tool({
      description:
        "Balances: without partyId = summary of everyone; with partyId = balance & active debts with that person.",
      inputSchema: z.object({ partyId: z.uuid().optional() }),
      execute: async ({ partyId }) => {
        if (!partyId) {
          const [s, due] = await Promise.all([balanceSummary(actor), dueSoon(actor)]);
          return {
            owedToMe: majorMap(s.owedToMe),
            iOwe: majorMap(s.iOwe),
            net: majorMap(s.net),
            dueSoon: due.slice(0, 8).map((d) => ({ ...d, remaining: major(d.remaining, d.currency) })),
          };
        }
        const p = await getPerson(actor, partyId);
        if (!p) return { error: "not_found" };
        return {
          name: p.header.name,
          net: majorMap(p.header.net),
          active: p.entries
            .filter((e) => e.kind === "OBLIGATION" && e.status === "ACTIVE" && !e.settled)
            .slice(0, 15)
            .map((e) => ({
              id: e.id,
              title: e.title,
              remaining: major(e.remaining, e.currency),
              currency: e.currency,
              direction: e.direction,
              date: e.date,
              dueOn: e.dueOn,
            })),
        };
      },
    }),
    listDebts: tool({
      description:
        "List debts (kind=debts) or payments (kind=payments) with filters. Results have ids for manageDebt/managePayment/getDetail. For totals and patterns use getStats instead.",
      inputSchema: z.object({
        kind: z.enum(["debts", "payments", "all"]).default("debts"),
        partyId: z.uuid().optional(),
        groupId: z.uuid().optional().describe("debts in this group only"),
        direction: z.enum(["they_owe_me", "i_owe"]).optional().describe("for debts"),
        status: z
          .enum(["active", "settled", "pending", "closed", "all"])
          .default("active")
          .describe("for debts: active = unpaid, closed = rejected/cancelled"),
        from: date.optional(),
        to: date.optional(),
        category: z.enum(CATEGORIES).optional(),
        label: z.string().max(30).optional().describe("private label"),
        currency: currencyCode.optional(),
      }),
      execute: async ({ kind, partyId, groupId, direction, status, from, to, category, label, currency }) => {
        const out: Array<Record<string, unknown>> = [];
        const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
        let truncated = false;

        if (kind !== "payments") {
          const STATUS = {
            active: ["OPEN"],
            settled: ["SETTLED"],
            pending: ["PENDING"],
            closed: ["CLOSED"],
            all: [],
          } as const;
          const rows = filterRecords(await allRecords(actor), {
            ...DEFAULT_RECORD_FILTER,
            status: [...STATUS[status]],
            dir: direction ? [direction === "they_owe_me" ? "THEY_OWE" : "I_OWE"] : [],
            people: partyId ? [partyId] : [],
            groups: groupId ? [groupId] : [],
            labels: label ? [label] : [],
            categories: category ? [category] : [],
            currencies: currency ? [currency as Currency] : [],
            sort: "newest",
          }).filter((r) => inRange(r.occurredOn));
          truncated = rows.length > LIST_MAX;
          for (const r of rows.slice(0, LIST_MAX)) {
            out.push({
              kind: "DEBT",
              person: r.counterpartName,
              group: r.groupName ?? undefined,
              title: r.title,
              amount: major(r.amount, r.currency),
              remaining: major(r.remaining, r.currency),
              currency: r.currency,
              direction: r.direction,
              status: r.status,
              waitingFor: r.pendingWith ?? undefined,
              category: r.category ?? undefined,
              labels: r.labels.length ? r.labels : undefined,
              date: r.occurredOn,
              dueOn: r.dueOn ?? undefined,
              id: r.id,
            });
          }
        }
        if (kind !== "debts") {
          const people = partyId ? [partyId] : contacts.map((c) => c.id);
          let checked = 0;
          while (checked < people.length && out.length <= LIST_MAX) {
            const batch = people.slice(checked, checked + LIST_BATCH);
            for (const p of await Promise.all(batch.map((id) => getPerson(actor, id)))) {
              if (!p) continue;
              for (const e of p.entries) {
                if (e.kind !== "SETTLEMENT" || !inRange(e.date)) continue;
                if (currency && e.currency !== currency) continue;
                out.push({
                  kind: e.settlementKind,
                  person: p.header.name,
                  amount: major(e.amount, e.currency),
                  currency: e.currency,
                  direction: e.direction,
                  method: e.method,
                  status: e.status,
                  date: e.date,
                  id: e.id,
                });
              }
            }
            checked += batch.length;
          }
          truncated ||= out.length > LIST_MAX || checked < people.length;
        }

        return {
          count: Math.min(out.length, LIST_MAX),
          items: out.slice(0, LIST_MAX),
          ...(truncated
            ? { truncated: true, hint: "results truncated; filter by partyId, groupId, from/to, status, or kind" }
            : {}),
        };
      },
    }),
    getStats: tool({
      description:
        "Statistics (D-112) for a period: totals lent/borrowed, what for (categories/labels with who), people, and payment habits BOTH ways (median days to settle, on-time, reminders, confirmation speed, unpaid by age). With partyId = just that person, compared with me.",
      inputSchema: z.object({
        partyId: z.uuid().optional(),
        period: z
          .enum(STAT_PERIODS as [StatPeriod, ...StatPeriod[]])
          .default("quarter")
          .describe("quarter = last 3 months"),
        currency: currencyCode.optional().describe("default: the main one"),
      }),
      execute: async ({ partyId, period, currency }) => {
        const input = await statsInput(actor);
        const scope = partyId
          ? { ...input, obligations: input.obligations.filter((o) => o.counterpartId === partyId) }
          : input;
        const currencies = statCurrencies(scope, actor.currency);
        const cur = (currency && currencies.includes(currency as Currency) ? currency : currencies[0]) as
          Currency | undefined;
        if (!cur) return { empty: true };
        const opts = { period, currency: cur, today: todayIn(actor.timezone, new Date()) };
        const mj = (v: number | null) => (v === null ? null : major(v, cur));
        const habits = (h: Habits) => ({
          settled: h.settledCount,
          typicalDays: h.medianDays,
          fastestDays: h.fastestDays,
          slowestDays: h.slowestDays,
          onTime: h.dueCount ? `${h.onTime}/${h.dueCount}` : null,
          avgLateDays: h.avgLateDays,
          remindersPerDebt: h.remindersAvg,
          confirmMinutes: h.confirmMinutes,
          installments: h.installments,
          favoriteMethod: h.favoriteMethod?.method ?? null,
          unpaid: h.openCount,
          unpaidAmount: mj(h.openAmount),
          oldestUnpaid: age(h.oldestOpenDays),
        });
        const sum = (x: Summary) => ({
          lent: mj(x.lent),
          lentCount: x.lentCount,
          borrowed: mj(x.borrowed),
          borrowedCount: x.borrowedCount,
          received: mj(x.received),
          paid: mj(x.paid),
        });
        const catNames = messagesFor(actor.locale).categories as Record<string, string>;
        const cats = (list: GroupBucket[], labels = false) =>
          list
            .slice(0, 8)
            .map((b) => ({
              key: b.key,
              name: labels ? `#${b.key}` : (catNames[b.key] ?? b.key),
              amount: mj(b.amount),
              count: b.count,
              mostOften: b.top?.name,
            }));

        const age = (d: number | null) =>
          d === null
            ? null
            : d < 60
              ? `${d} days`
              : d < 730
                ? `${Math.round(d / 30)} months`
                : `${Math.round((d / 365) * 10) / 10} years`;
        if (partyId) {
          const p = computePersonStats(input, partyId, opts);
          return {
            currency: cur,
            otherCurrencies: currencies.filter((c) => c !== cur),
            period,
            summary: sum(p.summary),
            theyPayMe: habits(p.habits.them),
            iPayThem: habits(p.habits.me),
            theyBorrowedFor: cats(p.categoriesIn),
            iBorrowedFor: cats(p.categoriesOut),
            page: `/people/${partyId}/stats`,
          };
        }
        const s = computeStats(input, opts);
        return {
          currency: cur,
          otherCurrencies: currencies.filter((c) => c !== cur),
          period,
          from: s.from,
          summary: sum(s.summary),
          categories: cats(s.categories),
          labels: cats(s.labels, true),
          people: s.people
            .slice(0, 15)
            .map((p) => ({
              name: p.name,
              partyId: p.id,
              lent: mj(p.lent),
              borrowed: mj(p.borrowed),
              debts: p.lentCount + p.borrowedCount,
              theyTypicalDays: p.theirDays,
              iTypicalDays: p.myDays,
            })),
          friendsPayMe: habits(s.habits.them),
          iPayFriends: habits(s.habits.me),
          unpaidByAge: s.aging.map((a) => ({ days: a.bucket, amount: mj(a.amount), count: a.count })),
          oldestUnpaid: s.oldestOpen ? { ...s.oldestOpen, days: undefined, age: age(s.oldestOpen.days) } : null,
          groups: s.groups.map((g) => ({
            name: g.name,
            debts: g.count,
            amount: mj(g.amount),
            topCategory: g.topCategory?.key,
            mostOftenPaidFirst: g.topPayer ? (g.topPayer.isMe ? "me" : g.topPayer.name) : null,
          })),
          averagePerDebt: mj(s.facts.avgAmount),
          biggest: s.facts.biggest ? { ...s.facts.biggest, amount: mj(s.facts.biggest.amount) } : null,
          page: "/stats",
        };
      },
    }),
    getDetail: tool({
      description:
        "Full detail of one debt (DEBT), payment (PAYMENT), split bill (BILL), group (GROUP, incl. members & roles), or person (PERSON, incl. mutual trust, block, recurring debts).",
      inputSchema: z.object({
        kind: z.enum(["DEBT", "PAYMENT", "BILL", "GROUP", "PERSON"]),
        id: z.uuid().describe("debt/payment/bill/group id, or partyId for PERSON"),
      }),
      execute: async ({ kind, id }) => {
        switch (kind) {
          case "DEBT": {
            const d = await getObligationDetail(actor, id);
            if (!d) return { error: "not_found" };
            const m = (v: number) => major(v, d.currency);
            return {
              id: d.id,
              title: d.title,
              amount: m(d.amount),
              paid: m(d.paid),
              remaining: m(d.amount - d.paid),
              currency: d.currency,
              status: d.status,
              direction: d.iAmCreditor ? "THEY_OWE" : d.iAmDebtor ? "I_OWE" : "OTHERS",
              person: d.counterpart,
              creditor: d.creditorName,
              debtor: d.debtorName,
              occurredOn: d.occurredOn,
              dueOn: d.dueOn,
              category: d.category,
              note: d.note,
              group: d.group,
              bill: d.bill,
              items: d.items.map((it) => ({ name: it.name, qty: it.qtyMilli / 1000, total: m(it.lineTotal) })),
              payments: d.payments.map((p) => ({ ...p, amount: m(p.amount) })),
              pending: d.pending && {
                kind: d.pending.kind,
                approverIsMe: d.pending.approverIsMe,
                requestId: d.pending.requestId,
              },
              installments: d.installments && {
                ...d.installments.plan,
                schedule: d.installments.schedule.map((x) => ({ ...x, amount: m(x.amount), paid: m(x.paid) })),
              },
              recurringId: d.recurringId,
              labels: d.labels,
              disputable: d.disputable.map((x) => ({ id: x.id, kind: x.kind, until: x.disputeUntil })),
              history: d.activity
                .slice(0, 10)
                .map((a) => ({ type: a.type, by: a.actorName, at: a.createdAt, via: a.via })),
            };
          }
          case "PAYMENT": {
            const s = await settlementCore(actor, id);
            if (!s) return { error: "not_found" };
            const [allocations, pending, excess] = await Promise.all([
              settlementAllocations(actor, id),
              settlementPending(actor, id),
              settlementExcess(actor, id),
            ]);
            return {
              ...s,
              amount: major(s.amount, s.currency),
              counterAmount:
                s.counterAmount !== null && s.counterCurrency ? major(s.counterAmount, s.counterCurrency) : null,
              allocations: allocations.map((a) => ({ ...a, amount: major(a.amount, a.currency) })),
              pending,
              excess: excess && { ...excess, amount: major(excess.amount, excess.currency) },
            };
          }
          case "BILL": {
            const b = await billCore(actor, id);
            if (!b) return { error: "not_found" };
            const m = (v: number) => major(v, b.currency);
            const shares = await billShares(actor, id);
            return {
              ...b,
              subtotal: m(b.subtotal),
              discount: m(b.discount),
              service: m(b.service),
              tax: m(b.tax),
              total: m(b.total),
              shares: shares.map((x) => ({
                partyId: x.partyId,
                name: x.name,
                total: m(x.total),
                remaining: m(x.remaining),
                status: x.status,
                debtId: x.obligationId,
              })),
            };
          }
          case "GROUP": {
            const g = await getGroupDetail(actor, id);
            if (!g) return { error: "not_found" };
            const entries = await groupEntries(actor, id);
            return {
              ...g,
              members: g.members.map((x) => ({ ...x, net: majorMap(x.net) })),
              recent: entries
                .slice(0, 20)
                .map((e) => ({ ...e, amount: major(e.amount, e.currency), myShare: major(e.myShare, e.currency) })),
            };
          }
          case "PERSON": {
            const p = await getPerson(actor, id);
            if (!p) return { error: "not_found" };
            const h = p.header;
            return {
              partyId: h.partyId,
              name: h.name,
              displayName: h.displayName,
              state: h.state,
              email: h.email,
              isMyManualContact: h.isMyManualContact,
              trust: h.trust,
              blocked: h.blocked,
              archived: h.archived,
              sharedGroups: h.sharedGroups,
              net: majorMap(h.net),
              waitingThem: h.waitingThem,
              waitingMe: h.waitingMe,
              recurring: h.recurring.map((r) => ({ ...r, amount: major(r.amount, r.currency) })),
              labels: h.labels,
              recent: p.entries
                .slice(0, 15)
                .map((e) => ({
                  kind: e.kind,
                  id: e.id,
                  title: e.title,
                  amount: major(e.amount, e.currency),
                  currency: e.currency,
                  direction: e.direction,
                  date: e.date,
                  status: e.status,
                  settled: e.settled,
                })),
            };
          }
        }
      },
    }),
    getInbox: tool({
      description:
        "Inbox: requests awaiting my decision (awaiting), my requests waiting on others (waiting), actions I can dispute (disputable), group invites, unread notification count.",
      inputSchema: z.object({}),
      execute: async () => {
        const [awaiting, waiting, disputable, groups, counts] = await Promise.all([
          listAwaiting(actor, 30),
          listWaiting(actor, 30),
          listDisputable(actor),
          listMyGroups(actor),
          inboxCounts(actor),
        ]);
        const req = (r: (typeof awaiting)[number]) => ({
          requestId: r.requestId,
          kind: r.displayKind,
          from: r.requesterName,
          waitingFor: r.approverName,
          title: r.title,
          group: r.groupName,
          amount: r.amount !== null && r.currency ? major(r.amount, r.currency) : null,
          currency: r.currency,
          changes: r.fields.length ? r.fields : undefined,
          reason: r.reason,
          createdAt: r.createdAt,
        });
        return {
          awaiting: awaiting.map(req),
          waiting: waiting.map(req),
          disputable: disputable.map((d) => ({
            disputeId: d.id,
            kind: d.kind,
            by: d.actorName,
            title: d.title,
            amount: d.amount !== null && d.currency ? major(d.amount, d.currency) : null,
            currency: d.currency,
            until: d.disputeUntil,
          })),
          groupInvites: groups
            .filter((g) => g.myStatus === "INVITED")
            .map((g) => ({ groupId: g.id, name: g.name, invitedBy: g.invitedBy, mode: g.mode })),
          unreadNotifications: counts.unread,
        };
      },
    }),
    search: tool({
      description: "Search people, groups, and debts by keyword.",
      inputSchema: z.object({ query: z.string().min(2).max(60) }),
      execute: async ({ query }) => {
        const r = await search(actor, query);
        return { ...r, debts: r.debts.map((d) => ({ ...d, amount: major(d.amount, d.currency) })) };
      },
    }),
    listGroups: tool({
      description: "The user's groups with their balance in each group (incl. unanswered group invites).",
      inputSchema: z.object({}),
      execute: async () =>
        (await listMyGroups(actor)).map((g) => ({
          id: g.id,
          name: g.name,
          mode: g.mode,
          status: g.myStatus,
          archived: g.archived || undefined,
          net: majorMap(g.net),
          members: g.memberCount,
        })),
    }),
  };
}

type AllTools = typeof clientTools &
  ReturnType<typeof serverTools> & { rescanPhoto: ReturnType<typeof rescanTool> } & ReturnType<typeof opTools>["tools"];
export type AssistantMessage = UIMessage<unknown, never, InferUITools<AllTools>>;
export type { OpOutput };
