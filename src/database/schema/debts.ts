import { sql } from "drizzle-orm";
import { type AnyPgColumn, char, check, date, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { bill } from "./bills";
import { createdAt, inList, money, ts } from "./columns";
import { groups } from "./groups";
import { settlement } from "./payments";
import { pair, party } from "./people";

export const OBLIGATION_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "VOID"] as const;

import { VIA } from "@/domain/activity";
export { VIA } from "@/domain/activity";

export type InstallmentPlanJson = { count: number; every: "WEEK" | "MONTH"; firstDue: string };

export const obligation = pgTable(
  "obligation",
  {
    id: uuid("id").primaryKey(),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pair.id),
    creditorId: uuid("creditor_id")
      .notNull()
      .references(() => party.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => party.id),
    groupId: uuid("group_id").references(() => groups.id),
    billId: uuid("bill_id").references(() => bill.id),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    paid: money("paid").notNull().default(0),
    title: text("title").notNull(),
    note: text("note"),
    category: text("category"),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),

    dueOn: date("due_on", { mode: "string" }),

    installments: jsonb("installments").$type<InstallmentPlanJson>(),

    recurringId: uuid("recurring_id").references((): AnyPgColumn => recurring.id),

    sourceSettlementId: uuid("source_settlement_id").references((): AnyPgColumn => settlement.id),
    status: text("status", { enum: OBLIGATION_STATUSES }).notNull(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdVia: text("created_via", { enum: VIA }).notNull().default("APP"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    activatedAt: ts("activated_at"),
    closedAt: ts("closed_at"),
  },
  (t) => [
    index("obligation_pair_status_idx").on(t.pairId, t.status),
    index("obligation_creditor_idx").on(t.creditorId, t.status),
    index("obligation_debtor_idx").on(t.debtorId, t.status),
    index("obligation_group_idx")
      .on(t.groupId)
      .where(sql`group_id is not null`),
    index("obligation_bill_idx")
      .on(t.billId)
      .where(sql`bill_id is not null`),
    index("obligation_due_idx")
      .on(t.dueOn)
      .where(sql`status = 'ACTIVE' and paid < amount and due_on is not null`),
    index("obligation_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("obligation_recurring_idx")
      .on(t.recurringId)
      .where(sql`recurring_id is not null`),
    index("obligation_source_settlement_idx")
      .on(t.sourceSettlementId)
      .where(sql`source_settlement_id is not null`),
    check("obligation_amount_ck", sql`amount > 0`),
    check("obligation_paid_ck", sql`paid >= 0 and paid <= amount`),
    check("obligation_parties_ck", sql`creditor_id <> debtor_id`),
    check("obligation_status_ck", inList("status", OBLIGATION_STATUSES)),
  ],
);

export const obligationItem = pgTable(
  "obligation_item",
  {
    id: uuid("id").primaryKey(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligation.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    qtyMilli: integer("qty_milli").notNull(),
    unitPrice: money("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    index("obligation_item_obligation_idx").on(t.obligationId),
    check("obligation_item_qty_ck", sql`qty_milli > 0`),

    check("obligation_item_price_ck", sql`abs(unit_price) <= 1000000000000 and abs(line_total) <= 1000000000000`),
  ],
);

export const RECURRING_EVERY = ["WEEK", "MONTH", "YEAR"] as const;

export const RECURRING_STATUSES = ["PENDING", "ACTIVE", "STOPPED", "REJECTED"] as const;

export const recurring = pgTable(
  "recurring",
  {
    id: uuid("id").primaryKey(),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pair.id),
    creditorId: uuid("creditor_id")
      .notNull()
      .references(() => party.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => party.id),
    groupId: uuid("group_id").references(() => groups.id),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    title: text("title").notNull(),
    note: text("note"),
    category: text("category"),
    every: text("every", { enum: RECURRING_EVERY }).notNull(),

    startOn: date("start_on", { mode: "string" }).notNull(),

    nextOn: date("next_on", { mode: "string" }).notNull(),

    dueAfterDays: integer("due_after_days"),

    timezone: text("timezone").notNull(),
    status: text("status", { enum: RECURRING_STATUSES }).notNull(),
    occurrences: integer("occurrences").notNull().default(0),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdVia: text("created_via", { enum: VIA }).notNull().default("APP"),
    createdAt: createdAt(),
    stoppedAt: ts("stopped_at"),
    stoppedBy: uuid("stopped_by").references(() => party.id),
  },
  (t) => [
    index("recurring_pair_idx").on(t.pairId, t.status),
    index("recurring_next_idx")
      .on(t.nextOn)
      .where(sql`status = 'ACTIVE'`),
    check("recurring_amount_ck", sql`amount > 0`),
    check("recurring_parties_ck", sql`creditor_id <> debtor_id`),
    check("recurring_every_ck", inList("every", RECURRING_EVERY)),
    check("recurring_status_ck", inList("status", RECURRING_STATUSES)),
  ],
);
