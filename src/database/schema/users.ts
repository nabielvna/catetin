import { char, date, integer, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt } from "./columns";
import { party } from "./people";

export const DIGEST_FREQUENCIES = ["WEEKLY", "DAILY", "OFF"] as const;

export const profile = pgTable("profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  partyId: uuid("party_id")
    .notNull()
    .unique()
    .references(() => party.id),
  currency: char("currency", { length: 3 }).notNull().default("IDR"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  quietStart: smallint("quiet_start").notNull().default(21),
  quietEnd: smallint("quiet_end").notNull().default(8),

  digest: text("digest", { enum: DIGEST_FREQUENCIES }).notNull().default("WEEKLY"),

  activeDays: integer("active_days").notNull().default(0),
  lastActiveOn: date("last_active_on", { mode: "string" }),
  createdAt: createdAt(),
});
