import type { LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { compareDueShapes, type DueShape } from "@/domain/installments";

export type PartyRef = {
  id: string;

  isUser: boolean;
};

export type GroupMode = "CONFIRM" | "TRUST";

export type ObligationChange = {
  amount?: { from: number; to: number };
  dueOn?: { from: LocalDate | null; to: LocalDate | null };

  schedule?: { from: DueShape; to: DueShape };
  metadata?: boolean;
};

export type PolicyAction =
  | { kind: "OBLIGATION_CREATE" }
  | { kind: "OBLIGATION_UPDATE"; change: ObligationChange }
  | { kind: "OBLIGATION_VOID" }
  | { kind: "PAYMENT_CREATE" }
  | { kind: "FORGIVE" }
  | { kind: "OFFSET_CREATE" }
  | { kind: "SETTLEMENT_VOID"; settlementKind: "PAYMENT" | "FORGIVE" | "OFFSET" }
  | { kind: "RECURRING_CREATE" };

export type PolicyInput = {
  action: PolicyAction;
  actorPartyId: string;
  creditor: PartyRef;
  debtor: PartyRef;

  groupMode?: GroupMode | null;

  groupTrustSince?: Date | null;

  trustSince?: Date | null;

  targetCreatedAt?: Date | null;
};

export type PolicyResult = {
  approvers: string[];

  harmed: string[];

  trusted: string[];
};

type Role = "CREDITOR" | "DEBTOR";

function harmedRoles(action: PolicyAction): Role[] {
  switch (action.kind) {
    case "OBLIGATION_CREATE":
    case "RECURRING_CREATE":
      return ["DEBTOR"];
    case "OBLIGATION_UPDATE":
      return classifyChangeHarm(action.change);
    case "OBLIGATION_VOID":
      return ["CREDITOR"];
    case "PAYMENT_CREATE":
      return ["CREDITOR"];
    case "FORGIVE":
      return ["CREDITOR"];
    case "OFFSET_CREATE":
      return ["CREDITOR", "DEBTOR"];
    case "SETTLEMENT_VOID":
      return action.settlementKind === "OFFSET" ? ["CREDITOR", "DEBTOR"] : ["DEBTOR"];
  }
}

export function classifyChangeHarm(change: ObligationChange): Role[] {
  if (change.schedule) {
    const cmp = compareDueShapes(change.schedule.from, change.schedule.to);
    if (cmp === "MIXED") throw new DomainError("MIXED_CHANGE");
    return cmp === "MORE" ? ["DEBTOR"] : cmp === "LESS" ? ["CREDITOR"] : [];
  }
  const roles = new Set<Role>();
  if (change.amount && change.amount.from !== change.amount.to) {
    roles.add(change.amount.to > change.amount.from ? "DEBTOR" : "CREDITOR");
  }
  if (change.dueOn && change.dueOn.from !== change.dueOn.to) {
    const { from, to } = change.dueOn;
    if (to === null) roles.add("CREDITOR");
    else if (from === null || to < from) roles.add("DEBTOR");
    else roles.add("CREDITOR");
  }
  if (roles.size > 1) throw new DomainError("MIXED_CHANGE");
  return [...roles];
}

function assertActorAllowed(input: PolicyInput): void {
  const { action, actorPartyId, creditor, debtor } = input;
  const isCreditor = actorPartyId === creditor.id;
  const isDebtor = actorPartyId === debtor.id;
  if (creditor.id === debtor.id) throw new DomainError("SELF_PAIR");

  switch (action.kind) {
    case "OBLIGATION_CREATE":
    case "RECURRING_CREATE":
      return;
    case "FORGIVE":
      if (!isCreditor) throw new DomainError("FORBIDDEN_ROLE");
      return;
    default:
      if (!isCreditor && !isDebtor) throw new DomainError("FORBIDDEN_ROLE");
  }
}

const CREATES: ReadonlySet<PolicyAction["kind"]> = new Set([
  "OBLIGATION_CREATE",
  "PAYMENT_CREATE",
  "FORGIVE",
  "OFFSET_CREATE",
  "RECURRING_CREATE",
]);

function coveredSince(since: Date, input: PolicyInput): boolean {
  if (CREATES.has(input.action.kind)) return true;
  return !!input.targetCreatedAt && input.targetCreatedAt.getTime() >= since.getTime();
}

export function pairTrustApplies(input: PolicyInput): boolean {
  const { trustSince, actorPartyId, creditor, debtor } = input;
  if (!trustSince) return false;
  if (actorPartyId !== creditor.id && actorPartyId !== debtor.id) return false;
  return coveredSince(trustSince, input);
}

export function groupTrustApplies(input: PolicyInput): boolean {
  if (input.groupMode !== "TRUST") return false;

  return coveredSince(input.groupTrustSince ?? new Date(0), input);
}

// Only disadvantaged users must approve. Trust can skip approval for covered records.
export function requiredApprovers(input: PolicyInput): PolicyResult {
  assertActorAllowed(input);
  const { action, actorPartyId, creditor, debtor } = input;
  const harmed = harmedRoles(action).map((r) => (r === "CREDITOR" ? creditor : debtor));
  const harmedIds = harmed.map((p) => p.id);

  const approvers = [...new Set(harmed.filter((p) => p.id !== actorPartyId && p.isUser).map((p) => p.id))];
  if (approvers.length > 0 && (groupTrustApplies(input) || pairTrustApplies(input))) {
    return { approvers: [], harmed: harmedIds, trusted: approvers };
  }
  return { approvers, harmed: harmedIds, trusted: [] };
}
