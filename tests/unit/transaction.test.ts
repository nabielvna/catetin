import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  invalidate: vi.fn(),
  publish: vi.fn(),
  dispatch: vi.fn(),
  after: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/database/transaction", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/server/cache-tags", () => ({ invalidateUsers: mocks.invalidate }));
vi.mock("@/integrations/realtime/server", () => ({ publish: mocks.publish }));
vi.mock("@/services/notifications/dispatch", () => ({ dispatchPending: mocks.dispatch }));
vi.mock("@/lib/server/logger", () => ({ log: { warn: mocks.warn, error: mocks.error, debug: mocks.debug } }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { mutate } from "@/services/transaction";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("business transaction effects", () => {
  it("runs cache and realtime only after the database commits", async () => {
    const events: string[] = [];
    mocks.transaction.mockImplementation(async (operation) => {
      const result = await operation({});
      expect(mocks.invalidate).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
      events.push("commit");
      return result;
    });
    mocks.invalidate.mockImplementation(() => events.push("cache"));
    mocks.publish.mockImplementation(async () => events.push("realtime"));
    const result = await mutate(async (_tx, effects) => {
      effects.refreshUsers(["a", "a", null], { scope: "ledger" });
      effects.refreshUsers(["b"], { scope: "ledger" });
      return "saved";
    });
    expect(result).toBe("saved");
    expect(events).toEqual(["commit", "cache", "realtime"]);
    expect([...mocks.publish.mock.calls[0]![0]]).toEqual(["a", "b"]);
  });
  it("discards effects on rollback", async () => {
    mocks.transaction.mockImplementation(async (operation) => {
      await operation({});
      throw new Error("rollback");
    });
    await expect(
      mutate(async (_tx, effects) => {
        effects.refreshUsers(["a"], { scope: "inbox" });
        effects.dispatch = true;
      }),
    ).rejects.toThrow("rollback");
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("preserves committed results and leaves delivery to cron outside a request", async () => {
    mocks.transaction.mockImplementation((operation) => operation({}));
    mocks.invalidate.mockImplementation(() => {
      throw new Error("cache offline");
    });
    mocks.publish.mockRejectedValue(new Error("realtime offline"));
    mocks.after.mockImplementation(() => {
      throw new Error("outside request");
    });
    mocks.dispatch.mockRejectedValue(new Error("SMTP offline"));
    await expect(
      mutate(async (_tx, effects) => {
        effects.refreshUsers(["a"], { scope: "inbox" });
        effects.dispatch = true;
        return 42;
      }),
    ).resolves.toBe(42);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.debug).toHaveBeenCalled();
  });
  it("schedules delivery from the service without loading an action wrapper", async () => {
    mocks.transaction.mockImplementation((operation) => operation({}));
    await mutate(async (_tx, effects) => {
      effects.dispatch = true;
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledOnce();
    mocks.dispatch.mockRejectedValue(new Error("SMTP offline"));
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalled();
  });
});
