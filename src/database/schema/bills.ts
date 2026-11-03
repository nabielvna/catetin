import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, money } from "./columns";
import { obligation } from "./debts";
import { file } from "./files";
import { groups } from "./groups";
import { party } from "./people";

export const BILL_STATUSES = ["ACTIVE", "VOID"] as const;

export const bill = pgTable(
  "bill",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id").references(() => groups.id),
    title: text("title").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    payerPartyId: uuid("payer_party_id")
      .notNull()
      .references(() => party.id),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull().default(0),
    service: money("service").notNull().default(0),
    tax: money("tax").notNull().default(0),
    total: money("total").notNull(),
    splitMode: text("split_mode").notNull(),

    input: jsonb("input").notNull(),
    receiptFileId: uuid("receipt_file_id").references((): AnyPgColumn => file.id),
    status: text("status", { enum: BILL_STATUSES }).notNull().default("ACTIVE"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdVia: text("created_via").notNull().default("APP"),
    createdAt: createdAt(),
  },
  (t) => [
    index("bill_group_idx").on(t.groupId),
    index("bill_payer_idx").on(t.payerPartyId),
    check("bill_total_ck", sql`total = subtotal - discount + service + tax`),
  ],
);

export const billShare = pgTable(
  "bill_share",
  {
    billId: uuid("bill_id")
      .notNull()
      .references(() => bill.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id),
    base: money("base").notNull(),
    discount: money("discount").notNull().default(0),
    service: money("service").notNull().default(0),
    tax: money("tax").notNull().default(0),
    total: money("total").notNull(),

    obligationId: uuid("obligation_id").references((): AnyPgColumn => obligation.id),

    infoOnly: boolean("info_only").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.billId, t.partyId] }), index("bill_share_party_idx").on(t.partyId)],
);
