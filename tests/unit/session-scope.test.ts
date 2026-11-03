import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), io: vi.fn(), getSession: vi.fn(), loadActor: vi.fn() }));

// React.cache is a no-op outside an RSC renderer. Model its shared memo store
// to exercise a prerender and private cache running in the same render.
vi.mock("react", () => ({
  cache: (fn: (...args: unknown[]) => unknown) => {
    const entries: { args: unknown[]; value: unknown }[] = [];
    return (...args: unknown[]) => {
      const entry = entries.find((e) => e.args.length === args.length && e.args.every((a, i) => a === args[i]));
      if (entry) return entry.value;
      const value = fn(...args);
      entries.push({ args, value });
      return value;
    };
  },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ io: mocks.io }));
vi.mock("@/integrations/auth/server", () => ({
  createAuth: () => ({ api: { getSession: mocks.getSession } }),
  googleEnabled: () => false,
}));
vi.mock("@/services/account/profile", () => ({ ensureProfile: vi.fn(), loadActor: mocks.loadActor }));
vi.mock("@/services/account/sessions", () => ({ recordSessionLocation: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("session memoization across rendering scopes", () => {
  it("does not reuse a suspended prerender session inside a private cache", async () => {
    const { getActor } = await import("@/services/auth");
    const prerenderHeaders = new Headers();
    const privateHeaders = new Headers();
    let resume!: () => void;
    mocks.headers.mockResolvedValueOnce(prerenderHeaders).mockResolvedValueOnce(privateHeaders);
    mocks.io
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resume = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ user: { id: "scope-user" } });
    mocks.loadActor.mockResolvedValue({ userId: "scope-user" });

    const prerender = getActor();
    await vi.waitFor(() => expect(mocks.io).toHaveBeenCalledOnce());
    const privateActor = getActor();
    try {
      await vi.waitFor(() => expect(mocks.loadActor).toHaveBeenCalledWith("scope-user"), { timeout: 500 });
      await expect(privateActor).resolves.toEqual({ userId: "scope-user" });
      expect(mocks.getSession).toHaveBeenCalledWith({ headers: privateHeaders });
    } finally {
      resume();
      await prerender;
    }
  });

  it("still deduplicates session reads within the same headers scope", async () => {
    const { getSession } = await import("@/services/auth");
    mocks.headers.mockResolvedValue(new Headers());
    mocks.io.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ user: { id: "deduplicated-user" } });

    await Promise.all([getSession(), getSession()]);

    expect(mocks.getSession).toHaveBeenCalledOnce();
  });
});
