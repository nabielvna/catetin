import type { Currency } from "@/domain/money";

export const NOTIFICATION_TYPES = {
  OBLIGATION_PROPOSED: "ACTION",
  CHANGE_PROPOSED: "ACTION",
  VOID_PROPOSED: "ACTION",
  SETTLEMENT_PROPOSED: "ACTION",
  OFFSET_PROPOSED: "ACTION",
  SETTLEMENT_VOID_PROPOSED: "ACTION",
  GROUP_MODE_PROPOSED: "ACTION",
  GROUP_JOIN_REQUESTED: "ACTION",
  GROUP_SIMPLIFY_PROPOSED: "ACTION",
  RECURRING_PROPOSED: "ACTION",
  TRUST_REQUESTED: "ACTION",
  TRUSTED_ACTION: "ACTION",
  TRUST_DISPUTED: "ACTION",
  MERGE_PROPOSED: "ACTION",

  OBLIGATION_RECORDED: "INFO",
  REQUEST_APPROVED: "INFO",
  REQUEST_REJECTED: "INFO",
  METADATA_CHANGED: "INFO",
  OBLIGATION_CHANGED: "INFO",
  OBLIGATION_VOIDED: "INFO",
  SETTLEMENT_RECORDED: "INFO",
  SETTLEMENT_VOIDED: "INFO",
  OBLIGATION_SETTLED: "INFO",
  FORGIVEN: "INFO",
  INVITE_ACCEPTED: "INFO",
  GROUP_ADDED: "INFO",
  GROUP_MODE_CHANGED: "INFO",
  BILL_CREATED: "INFO",
  RECURRING_STARTED: "INFO",
  RECURRING_CREATED: "INFO",
  RECURRING_STOPPED: "INFO",
  TRUST_ON: "INFO",
  TRUST_OFF: "INFO",

  DUE_IN_3: "REMINDER",
  DUE_IN_1: "REMINDER",
  DUE_TODAY: "REMINDER",
  OVERDUE: "REMINDER",
  MANUAL_REMINDER: "REMINDER",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationTopic = (typeof NOTIFICATION_TYPES)[NotificationType];

export const DEFAULT_CHANNELS: Record<NotificationTopic, { PUSH: boolean; EMAIL: boolean }> = {
  ACTION: { PUSH: true, EMAIL: false },
  INFO: { PUSH: false, EMAIL: false },
  REMINDER: { PUSH: true, EMAIL: false },
};

export type NotificationData = {
  actorName?: string;
  counterpartName?: string;
  groupName?: string;
  title?: string;
  amount?: number;
  currency?: string;

  direction?: "I_OWE" | "THEY_OWE";
  decision?: "APPROVED" | "REJECTED";
  reason?: string | null;
  days?: number;
  count?: number;
  mode?: string;

  seq?: number;
  seqTotal?: number;
  changes?: string[];

  locale?: "id" | "en";
};

export type StoredPayload = {
  type: NotificationType;
  url: string;
  data: NotificationData;

  tag?: string;
};

export type DigestLine = {
  title: string;
  name: string;
  amount: number;
  currency: Currency;
  dueOn: string;
  direction: "I_OWE" | "THEY_OWE";
  days: number;
  seq: number | null;
};

export type DigestData = {
  frequency: "WEEKLY" | "DAILY";
  net: Array<{ currency: Currency; amount: number }>;
  due: DigestLine[];
  overdue: DigestLine[];
  overdueMore: number;
  awaiting: number;
  disputable: number;
};
