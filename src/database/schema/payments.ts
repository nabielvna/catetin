import { sql } from "drizzle-orm";
import { char, check, date, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { VIA } from "@/domain/activity";

import { user } from "./auth";
import { createdAt, inList, money, ts } from "./columns";
import { obligation } from "./debts";
import { groups } from "./groups";
import { pair, party } from "./people";

export const SETTLEMENT_KINDS = ["PAYMENT", "FORGIVE", "OFFSET", "NETTING"] as const;

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "EWALLET", "OTHER"] as const;

export const SETTLEMENT_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "CANCELLED", "VOID"] as const;

export const settlement = pgTable(
  "settlement",
  {
    id: uuid("id").primaryKey(),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pair.id),
    kind: text("kind", { enum: SETTLEMENT_KINDS }).notNull(),
    method: text("method", { enum: PAYMENT_METHODS }),

    payerId: uuid("payer_id")
      .notNull()
      .references(() => party.id),
    payeeId: uuid("payee_id")
      .notNull()
      .references(() => party.id),

    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),

    // The counter currency belongs to the debt or second offset leg. Rate is counter units per payment unit.
    counterCurrency: char("counter_currency", { length: 3 }),
    counterAmount: money("counter_amount"),
    rate: text("rate"),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    note: text("note"),
    status: text("status", { enum: SETTLEMENT_STATUSES }).notNull(),

    groupId: uuid("group_id").references(() => groups.id),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdVia: text("created_via", { enum: VIA }).notNull().default("APP"),
    createdAt: createdAt(),
    activatedAt: ts("activated_at"),
    closedAt: ts("closed_at"),
  },
  (t) => [
    index("settlement_pair_status_idx").on(t.pairId, t.status),
    index("settlement_group_idx")
      .on(t.groupId)
      .where(sql`group_id is not null`),
    check("settlement_amount_ck", sql`amount > 0`),
    check("settlement_kind_ck", inList("kind", SETTLEMENT_KINDS)),
    check("settlement_status_ck", inList("status", SETTLEMENT_STATUSES)),
    check("settlement_parties_ck", sql`payer_id <> payee_id`),
    check(
      "settlement_counter_ck",
      sql`(counter_currency is null) = (counter_amount is null) and (counter_currency is null) = (rate is null)`,
    ),
  ],
);

export const settlementAllocation = pgTable(
  "settlement_allocation",
  {
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlement.id, { onDelete: "cascade" }),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligation.id),

    amount: money("amount").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.settlementId, t.obligationId] }),
    index("settlement_allocation_obligation_idx").on(t.obligationId),
    check("settlement_allocation_amount_ck", sql`amount > 0`),
  ],
);
