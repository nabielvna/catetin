import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList, ts } from "./columns";
import { groups } from "./groups";
import { party } from "./people";

export const INVITE_KINDS = ["CLAIM", "CONNECT", "GROUP"] as const;

export const invite = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey(),

    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind", { enum: INVITE_KINDS }).notNull(),

    partyId: uuid("party_id").references(() => party.id, { onDelete: "cascade" }),

    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetEmail: text("target_email"),

    targetUserId: uuid("target_user_id").references(() => user.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedBy: uuid("last_used_by").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("invite_party_idx").on(t.partyId),
    index("invite_group_idx").on(t.groupId),
    index("invite_creator_idx").on(t.createdBy),
    index("invite_target_user_idx")
      .on(t.targetUserId)
      .where(sql`target_user_id is not null`),
    check("invite_kind_ck", inList("kind", INVITE_KINDS)),
    check("invite_claim_ck", sql`(kind = 'CLAIM') = (party_id is not null)`),
    check("invite_group_ck", sql`kind <> 'GROUP' or group_id is not null`),
  ],
);
