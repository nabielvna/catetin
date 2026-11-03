import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList, ts } from "./columns";
import { groups } from "./groups";
import { pair, party } from "./people";

export const APPROVAL_KINDS = [
  "OBLIGATION_CREATE",
  "OBLIGATION_UPDATE",
  "OBLIGATION_VOID",
  "SETTLEMENT_CREATE",
  "SETTLEMENT_VOID",
  "GROUP_MODE",
  "GROUP_JOIN",
  "GROUP_SIMPLIFY",
  "RECURRING_CREATE",
] as const;

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "SUPERSEDED"] as const;

export const VOTE_DECISIONS = ["PENDING", "APPROVED", "REJECTED"] as const;

export const approvalRequest = pgTable(
  "approval_request",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind", { enum: APPROVAL_KINDS }).notNull(),
    pairId: uuid("pair_id").references(() => pair.id),
    groupId: uuid("group_id").references(() => groups.id),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    baseVersion: integer("base_version"),
    requestedBy: uuid("requested_by").references(() => user.id, { onDelete: "set null" }),
    requestedByParty: uuid("requested_by_party").references(() => party.id),
    status: text("status", { enum: APPROVAL_STATUSES }).notNull().default("PENDING"),
    reason: text("reason"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    uniqueIndex("approval_one_pending_uq")
      .on(t.targetType, t.targetId, sql`coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`status = 'PENDING'`),
    index("approval_pair_idx").on(t.pairId, t.status),
    index("approval_group_idx").on(t.groupId, t.status),
    index("approval_requester_idx").on(t.requestedByParty, t.status),
    check("approval_kind_ck", inList("kind", APPROVAL_KINDS)),
    check("approval_status_ck", inList("status", APPROVAL_STATUSES)),
  ],
);

export const approvalVote = pgTable(
  "approval_vote",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequest.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id),
    decision: text("decision", { enum: VOTE_DECISIONS }).notNull().default("PENDING"),
    decidedBy: uuid("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.partyId] }),
    index("approval_vote_party_idx").on(t.partyId, t.decision),
    check("approval_vote_decision_ck", inList("decision", VOTE_DECISIONS)),
  ],
);

export const TRUST_ACTION_KINDS = [
  "OBLIGATION_CREATE",
  "OBLIGATION_UPDATE",
  "OBLIGATION_VOID",
  "SETTLEMENT_CREATE",
  "SETTLEMENT_VOID",
  "RECURRING_CREATE",
] as const;

export const trustAction = pgTable(
  "trust_action",
  {
    id: uuid("id").primaryKey(),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pair.id),
    kind: text("kind", { enum: TRUST_ACTION_KINDS }).notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    actorPartyId: uuid("actor_party_id")
      .notNull()
      .references(() => party.id),
    harmedPartyId: uuid("harmed_party_id")
      .notNull()
      .references(() => party.id),

    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    disputeUntil: ts("dispute_until").notNull(),
    disputedAt: ts("disputed_at"),
  },
  (t) => [
    index("trust_action_harmed_idx").on(t.harmedPartyId, t.disputeUntil),
    index("trust_action_target_idx").on(t.targetType, t.targetId),
    check("trust_action_kind_ck", inList("kind", TRUST_ACTION_KINDS)),
  ],
);
