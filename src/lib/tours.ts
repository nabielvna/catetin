export type TourParam = "partyId" | "groupId" | "debtId" | "paymentId";
export type TourParams = Partial<Record<TourParam, string>>;

export type TourStep = {
  target: string | readonly string[];

  path?: string;

  until?: "tap" | "saved";

  dim?: boolean;

  gate?: boolean;
};

export type Tour = {
  about: string;

  needs?: TourParam;

  start?: string;

  assist: "review" | "confirm" | "ask" | null;
  steps: readonly TourStep[];
};

const NEW = "nav.new";
const ACCOUNT = "nav.account";
const PERSON = "/people/[partyId]";
const DEBT = "/debts/[debtId]";
const PAYMENT = "/payments/[paymentId]";
const GROUP = "/groups/[groupId]";
const NOTIF = "/account/notifications";
const saved = { until: "saved" } as const;
const form = { until: "saved", dim: false } as const;

const viaMenu = (path: string, menu: string, item: string, last: string, lastStep: Partial<TourStep> = saved) =>
  [
    { target: menu, path },
    { target: item, path },
    { target: last, path, ...lastStep },
  ] as const;

export const TOURS = {
  "debt.create": {
    about: "record a new debt",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.debt", "person.record"] },
      { target: "debt.submit", path: "/debts/new", ...form },
    ],
  },
  "debt.installments": {
    about: "record a debt paid in installments",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.debt", "person.record"] },
      { target: "debt.plan.installments", path: "/debts/new", gate: true },
      { target: "debt.submit", path: "/debts/new", ...form },
    ],
  },
  "debt.recurring": {
    about: "record a recurring debt (weekly/monthly dues)",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.debt", "person.record"] },
      { target: "debt.plan.repeat", path: "/debts/new", gate: true },
      { target: "debt.submit", path: "/debts/new", ...form },
    ],
  },
  "debt.scan": {
    about: "record a debt from a receipt photo",
    assist: "review",
    steps: [{ target: NEW }, { target: ["new.debt", "person.record"] }, { target: "scan.open", path: "/debts/new" }],
  },
  "payment.create": {
    about: "record a payment / settlement (receive or pay)",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.payment", "person.receive", "person.pay"] },
      { target: "payment.pick", path: "/payments/new" },
      { target: "payment.submit", path: "/payments/new", ...form },
    ],
  },
  "payment.scan": {
    about: "record a payment from a transfer receipt photo",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.payment", "person.receive", "person.pay"] },
      { target: "payment.pick", path: "/payments/new" },
      { target: "scan.open", path: "/payments/new" },
    ],
  },
  "bill.create": {
    about: "split bill / share a group bill",
    assist: "review",
    steps: [
      { target: NEW },
      { target: "new.bill" },
      { target: "bill.next1", path: "/bills/new", dim: false },
      { target: "bill.next2", path: "/bills/new", dim: false },
      { target: "bill.submit", path: "/bills/new", ...form },
    ],
  },
  "bill.scan": {
    about: "split bill from a receipt photo",
    assist: "review",
    steps: [{ target: NEW }, { target: "new.bill" }, { target: "scan.open", path: "/bills/new" }],
  },
  "group.create": {
    about: "create a group",
    assist: "review",
    steps: [
      { target: NEW },
      { target: ["new.group", "groups.new"] },
      { target: "group.create.submit", path: "/groups/new", ...form },
    ],
  },

  "person.add": {
    about: "add a person / new contact",
    assist: "review",
    start: "/people",
    steps: [{ target: "people.add" }, { target: "person.add.submit", path: "/people/new", ...form }],
  },
  "person.connect": {
    about: "connect with a friend via QR / invite-a-friend link",
    assist: "confirm",
    start: "/people",
    steps: [{ target: "people.add" }, { target: ["person.qr.show", "person.qr.scan"], path: "/people/new" }],
  },
  "person.rename": {
    about: "rename a person",
    needs: "partyId",
    start: PERSON,
    assist: "review",
    steps: viaMenu(PERSON, "person.menu", "person.menu.rename", "person.rename.form"),
  },
  "person.email": {
    about: "set/change a contact's email (someone not using the app yet)",
    needs: "partyId",
    start: PERSON,
    assist: "review",
    steps: viaMenu(PERSON, "person.menu", "person.menu.email", "person.email.form"),
  },
  "person.remind": {
    about: "remind / ask someone to pay",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [{ target: "person.remind", path: PERSON, ...saved }],
  },
  "person.trust": {
    about: "turn mutual trust with a friend on/off",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.trust.switch", path: PERSON, ...saved },
      { target: "person.trust.confirm", path: PERSON, ...saved },
    ],
  },
  "person.block": {
    about: "block someone",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.menu", path: PERSON },
      { target: "person.menu.block", path: PERSON, ...saved },
      { target: "person.block.confirm", path: PERSON, ...saved },
    ],
  },
  "person.unblock": {
    about: "unblock someone / see the blocked list",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.blocked", path: "/account" },
      { target: "blocked.unblock", path: "/account/blocked", ...saved },
    ],
  },
  "person.merge": {
    about: "merge duplicate contacts",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.menu", path: PERSON },
      { target: "person.menu.merge", path: PERSON },
      { target: "person.merge.list", path: PERSON },
      { target: "person.merge.confirm", path: PERSON, ...saved },
    ],
  },
  "person.archive": {
    about: "archive a contact / unarchive",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.menu", path: PERSON },
      { target: "person.menu.archive", path: PERSON, ...saved },
    ],
  },
  "person.delete": {
    about: "delete a contact (one with no records yet)",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: viaMenu(PERSON, "person.menu", "person.menu.delete", "person.delete.confirm"),
  },
  "person.invite": {
    about: "invite a contact to use the app / invite link",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: viaMenu(PERSON, "person.menu", "person.menu.invite", "invite.sheet", {}),
  },
  "person.statement": {
    about: "download a PDF report / print / CSV of records with someone",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.menu", path: PERSON },
      { target: ["person.menu.pdf", "person.menu.print", "person.menu.csv"], path: PERSON },
    ],
  },
  "debt.stopRepeat": {
    about: "stop a recurring debt",
    needs: "partyId",
    start: PERSON,
    assist: "confirm",
    steps: [
      { target: "person.recurring.item", path: PERSON },
      { target: "person.recurring.stop", path: PERSON, ...saved },
    ],
  },
  "payment.offset": {
    about: "offset debts (you owe each other)",
    needs: "partyId",
    start: PERSON,
    assist: "review",
    steps: [
      { target: "person.offset", path: PERSON },
      { target: "offset.submit", path: "/payments/new", ...form },
    ],
  },

  "debt.edit": {
    about: "edit a debt (amount, title, date, installments)",
    needs: "debtId",
    start: DEBT,
    assist: "review",
    steps: [
      { target: "debt.menu", path: DEBT },
      { target: "debt.menu.edit", path: DEBT },
      { target: "debt.edit.submit", path: `${DEBT}/edit`, ...form },
    ],
  },
  "debt.delete": {
    about: "delete / withdraw a debt",
    needs: "debtId",
    start: DEBT,
    assist: "confirm",
    steps: viaMenu(DEBT, "debt.menu", "debt.menu.void", "debt.void.confirm"),
  },
  "debt.forgive": {
    about: "forgive the remaining debt",
    needs: "debtId",
    start: DEBT,
    assist: "confirm",
    steps: viaMenu(DEBT, "debt.menu", "debt.menu.forgive", "debt.forgive.confirm"),
  },
  "debt.labels": {
    about: "add a private label to a debt",
    needs: "debtId",
    start: DEBT,
    assist: "review",
    steps: [
      { target: "debt.labels.open", path: DEBT },
      { target: "debt.labels.sheet", path: DEBT, ...saved },
    ],
  },
  "debt.attach": {
    about: "attach a proof photo to a debt",
    needs: "debtId",
    start: DEBT,
    assist: "confirm",
    steps: [{ target: "evidence.add", path: DEBT, ...form }],
  },
  "payment.cancel": {
    about: "cancel / withdraw a payment",
    needs: "paymentId",
    start: PAYMENT,
    assist: "confirm",
    steps: [
      { target: "payment.void", path: PAYMENT, ...saved },
      { target: "payment.void.confirm", path: PAYMENT, ...saved },
    ],
  },
  "payment.attach": {
    about: "attach a proof photo to a payment",
    needs: "paymentId",
    start: PAYMENT,
    assist: "confirm",
    steps: [{ target: "evidence.add", path: PAYMENT, ...form }],
  },

  "inbox.respond": {
    about: "approve / reject a request (debt, payment, etc.)",
    assist: "confirm",
    steps: [
      { target: "nav.inbox" },
      { target: "inbox.tab.action", path: "/inbox" },
      { target: "inbox.request", path: "/inbox", ...saved },
    ],
  },
  "inbox.withdraw": {
    about: "withdraw a request still waiting on someone else",
    assist: "confirm",
    steps: [
      { target: "nav.inbox" },
      { target: "inbox.tab.waiting", path: "/inbox" },
      { target: "inbox.withdraw", path: "/inbox", ...saved },
    ],
  },
  "inbox.dispute": {
    about: "dispute a record that took effect immediately (trusted group / mutual trust)",
    assist: "confirm",
    steps: [
      { target: "nav.inbox" },
      { target: "inbox.tab.action", path: "/inbox" },
      { target: "dispute.open", path: "/inbox" },
      { target: "dispute.sheet", path: "/inbox", ...saved },
    ],
  },

  "group.addMembers": {
    about: "add a group member",
    needs: "groupId",
    start: GROUP,
    assist: "review",
    steps: [
      { target: "group.tab.members", path: GROUP },
      { target: "group.members.add", path: GROUP },
      { target: "group.members.submit", path: GROUP, ...form },
    ],
  },
  "group.rename": {
    about: "rename a group",
    needs: "groupId",
    start: GROUP,
    assist: "review",
    steps: viaMenu(GROUP, "group.menu", "group.menu.rename", "group.rename.form"),
  },
  "group.role": {
    about: "make / remove a group admin",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: [
      { target: "group.tab.members", path: GROUP },
      { target: "group.member.menu", path: GROUP },
      { target: "group.member.role", path: GROUP, ...saved },
    ],
  },
  "group.removeMember": {
    about: "remove a member from a group",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: [
      { target: "group.tab.members", path: GROUP },
      { target: "group.member.menu", path: GROUP },
      { target: "group.member.remove", path: GROUP, ...saved },
    ],
  },
  "group.leave": {
    about: "leave a group",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: viaMenu(GROUP, "group.menu", "group.menu.leave", "group.leave.confirm"),
  },
  "group.mode": {
    about: "change group mode (needs confirmation / trusted group)",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: viaMenu(GROUP, "group.menu", "group.menu.mode", "group.mode.options"),
  },
  "group.archive": {
    about: "archive a group",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: viaMenu(GROUP, "group.menu", "group.menu.archive", "group.archive.confirm"),
  },
  "group.simplify": {
    about: "simplify group debts (fewer transfers)",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: [
      { target: "group.tab.balances", path: GROUP },
      { target: "group.simplify", path: GROUP, ...saved },
    ],
  },
  "group.inviteLink": {
    about: "group invite link / QR",
    needs: "groupId",
    start: GROUP,
    assist: "confirm",
    steps: viaMenu(GROUP, "group.menu", "group.menu.invite", "group.invite.share", {}),
  },
  "group.acceptInvite": {
    about: "accept / decline a group invite",
    assist: "confirm",
    start: "/groups",
    steps: [{ target: "group.invitation", path: "/groups", ...saved }],
  },

  "settings.name": {
    about: "change my profile name",
    assist: "review",
    steps: [
      { target: ACCOUNT },
      { target: "account.name", path: "/account" },
      { target: "account.name.sheet", path: "/account", ...saved },
    ],
  },
  "settings.language": {
    about: "change the app language",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.language", path: "/account" },
      { target: "option.sheet", path: "/account", ...saved },
    ],
  },
  "settings.currency": {
    about: "change the main currency",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.currency", path: "/account" },
      { target: "option.sheet", path: "/account", ...saved },
    ],
  },
  "settings.timezone": {
    about: "change the time zone",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.timezone", path: "/account" },
      { target: "option.sheet", path: "/account", ...saved },
    ],
  },
  "settings.theme": {
    about: "change light/dark theme",
    assist: null,
    steps: [
      { target: ACCOUNT },
      { target: "account.theme", path: "/account" },
      { target: "option.sheet", path: "/account" },
    ],
  },
  "settings.notifications": {
    about: "configure notifications per topic (push/email)",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.notifications", path: "/account" },
      { target: "notif.pushTopics", path: NOTIF, ...form },
    ],
  },
  "settings.digest": {
    about: "daily/weekly email digest",
    assist: "confirm",
    steps: [
      { target: ACCOUNT },
      { target: "account.notifications", path: "/account" },
      { target: "notif.digest", path: NOTIF },
      { target: "option.sheet", path: NOTIF, ...saved },
    ],
  },
  "settings.quietHours": {
    about: "quiet hours (notifications silent at certain times)",
    assist: "review",
    steps: [
      { target: ACCOUNT },
      { target: "account.notifications", path: "/account" },
      { target: "notif.quiet", path: NOTIF, ...saved },
      { target: "notif.quietTime", path: NOTIF },
      { target: "notif.quiet.sheet", path: NOTIF, ...saved },
    ],
  },
  "settings.push": {
    about: "turn on push notifications on this device",
    assist: null,
    steps: [
      { target: ACCOUNT },
      { target: "account.notifications", path: "/account" },
      { target: "notif.push", path: NOTIF },
    ],
  },
  "settings.feedback": {
    about: "send feedback / report a problem",
    assist: "review",
    steps: [
      { target: ACCOUNT },
      { target: "account.feedback", path: "/account" },
      { target: "account.feedback.sheet", path: "/account", ...saved },
    ],
  },
  "account.signIn": {
    about: "sign-in methods / connect a Google account",
    assist: null,
    steps: [
      { target: ACCOUNT },
      { target: "account.signIn", path: "/account" },
      { target: "account.signIn.sheet", path: "/account" },
    ],
  },
  "account.devices": {
    about: "sign out of other devices",
    assist: null,
    steps: [
      { target: ACCOUNT },
      { target: "account.devices", path: "/account" },
      { target: "devices.signOutOthers", path: "/account/devices" },
      { target: "devices.sheet", path: "/account/devices", ...saved },
    ],
  },
  "account.export": {
    about: "download all my account data",
    assist: "confirm",
    steps: [{ target: ACCOUNT }, { target: "account.download", path: "/account" }],
  },
  "account.delete": {
    about: "delete account",
    assist: null,
    steps: [
      { target: ACCOUNT },
      { target: "account.delete", path: "/account" },
      { target: "account.delete.sheet", path: "/account", ...saved },
    ],
  },
  "search.find": {
    about: "search records / people",
    assist: "ask",
    steps: [{ target: "nav.home" }, { target: "home.search", path: "/home" }],
  },
  "records.filter": {
    about:
      "see all records (unpaid, paid, waiting…) and filter them by status, direction, person, group, label, category or currency",
    assist: "ask",
    steps: [
      { target: "nav.home" },
      { target: "home.records.all", path: "/home" },
      { target: "records.filters", path: "/debts" },
    ],
  },
  "stats.view": {
    about:
      "see statistics: totals per period, per month, what for (categories/labels), who, how fast debts get paid back",
    assist: "ask",
    steps: [{ target: "nav.home" }, { target: "home.stats", path: "/home" }],
  },
  "person.stats": {
    about: "see statistics with one person: how fast they / I pay back, on time, what for",
    needs: "partyId",
    start: PERSON,
    assist: "ask",
    steps: [{ target: "person.stats", path: PERSON }],
  },
} as const satisfies Record<string, Tour>;

export type TourId = keyof typeof TOURS;
export const TOUR_IDS = Object.keys(TOURS) as [TourId, ...TourId[]];

export function isTourId(v: unknown): v is TourId {
  return typeof v === "string" && Object.hasOwn(TOURS, v);
}

export function targetsOf(step: TourStep): readonly string[] {
  return typeof step.target === "string" ? [step.target] : step.target;
}

export function resolvePath(pattern: string, params: TourParams): string | null {
  let missing = false;
  const out = pattern.replace(/\[(\w+)\]/g, (_, k: string) => {
    const v = params[k as TourParam];
    if (!v) missing = true;
    return v ?? "";
  });
  return missing ? null : out;
}

export function currentStep(
  tour: Tour,
  params: TourParams,
  pathname: string,
  visible: (target: string) => boolean,
  passed: ReadonlySet<number> = new Set(),
): number {
  for (let i = tour.steps.length - 1; i >= 0; i--) {
    const step = tour.steps[i]!;
    if (tour.steps.some((s, j) => j < i && s.gate && !passed.has(j))) continue;
    if (step.path && resolvePath(step.path, params) !== pathname) continue;
    if (targetsOf(step).some(visible)) return i;
  }
  return -1;
}

export function onTourPath(tour: Tour, params: TourParams, pathname: string): boolean {
  if (tour.start && resolvePath(tour.start, params) === pathname) return true;
  return tour.steps.some((s) => s.path !== undefined && resolvePath(s.path, params) === pathname);
}
