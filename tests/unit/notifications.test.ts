import { describe, expect, it } from "vitest";

import { renderDigest } from "@/services/notifications/digest-text";
import { renderNotification } from "@/services/notifications/render";
import { NOTIFICATION_TYPES } from "@/services/notifications/types";

describe("notification text", () => {
  it.each(["id", "en"] as const)("renders every notification kind in %s", (locale) => {
    for (const type of Object.keys(NOTIFICATION_TYPES) as Array<keyof typeof NOTIFICATION_TYPES>) {
      const text = renderNotification(
        {
          type,
          url: "/home",
          data: { actorName: "Budi", counterpartName: "Ani", title: "Lunch", amount: 50000, currency: "IDR" },
        },
        locale,
      );
      expect(text.title.length, type).toBeGreaterThan(0);
      expect(text.body, type).not.toContain("notifications.");
    }
  });
  it.each(["id", "en"] as const)("renders digest balances in %s", (locale) => {
    const text = renderDigest(
      {
        frequency: "WEEKLY",
        net: [{ currency: "IDR", amount: 50000 }],
        due: [],
        overdue: [],
        overdueMore: 0,
        awaiting: 1,
        disputable: 0,
      },
      locale,
      "https://example.com/home",
    );
    expect(text.sections).toHaveLength(2);
    expect(text.subject).not.toContain("email.digest.");
    expect(text.url).toBe("https://example.com/home");
  });
});
