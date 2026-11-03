import { bigserial, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { VIA } from "@/domain/activity";

import { user } from "./auth";
import { bill } from "./bills";
import { createdAt } from "./columns";
import { groups } from "./groups";
import { pair, party } from "./people";

export const activity = pgTable(
  "activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pairId: uuid("pair_id").references(() => pair.id),
    groupId: uuid("group_id").references(() => groups.id),
    billId: uuid("bill_id").references(() => bill.id),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorPartyId: uuid("actor_party_id").references(() => party.id),
    type: text("type").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    via: text("via", { enum: VIA }).notNull().default("APP"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_pair_idx").on(t.pairId, t.id),
    index("activity_group_idx").on(t.groupId, t.id),
    index("activity_target_idx").on(t.targetType, t.targetId),
  ],
);
