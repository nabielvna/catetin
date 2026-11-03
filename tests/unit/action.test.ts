import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainError } from "@/domain/errors";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  consume: vi.fn(),
  invalidate: vi.fn(),
  rethrow: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/services/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/server/rate-limit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/server/cache-tags", () => ({ invalidateUsers: mocks.invalidate }));
vi.mock("@/lib/server/logger", () => ({ log: { error: mocks.log } }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.rethrow }));
import { action } from "@/actions/action";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "user", partyId: "party" });
});

describe("server action boundary", () => {
  it("validates input before calling the handler", async () => {
    const handler = vi.fn();
    const save = action(z.object({ name: z.string().min(1) }), handler);
    expect(await save({ name: "" })).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      fields: { name: expect.any(Array) },
    });
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated mutations", async () => {
    mocks.actor.mockRejectedValue(new DomainError("UNAUTHENTICATED"));
    const handler = vi.fn();
    expect(await action(z.object({}), handler)({})).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(handler).not.toHaveBeenCalled();
  });
  it("does not expose internal errors", async () => {
    const save = action(z.object({}), async () => {
      throw new Error("private database credentials");
    });
    expect(await save({})).toEqual({ ok: false, code: "INTERNAL" });
  });
  it("returns coded domain errors and parameters", async () => {
    const save = action(z.object({}), async () => {
      throw new DomainError("OVERPAY", { max: 100 });
    });
    expect(await save({})).toEqual({ ok: false, code: "OVERPAY", params: { max: 100 } });
  });
  it("rate limits mutations before execution and invalidates after success", async () => {
    const handler = vi.fn().mockResolvedValue({ id: "saved" });
    expect(await action(z.object({}), handler)({})).toEqual({ ok: true, data: { id: "saved" } });
    expect(mocks.consume).toHaveBeenCalledWith("act:user", 60, 60);
    expect(mocks.invalidate).toHaveBeenCalledWith(["user"]);
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(handler.mock.invocationCallOrder[0]!);
    expect(handler.mock.invocationCallOrder[0]).toBeLessThan(mocks.invalidate.mock.invocationCallOrder[0]!);
  });
});
