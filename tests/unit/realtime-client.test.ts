import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  setAuth: vi.fn(),
  disconnect: vi.fn(),
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { subscribeChanges } from "@/integrations/realtime/client";

const info = {
  driver: "supabase",
  url: "https://example.supabase.co",
  anonKey: "sb_publishable_test",
  token: "catetin-user-jwt",
  topic: "user:test-user",
};

let cleanup: (() => void) | undefined;
let fetchToken: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  const channel = { on: mocks.on, subscribe: mocks.subscribe };
  mocks.on.mockReturnValue(channel);
  mocks.subscribe.mockReturnValue(channel);
  mocks.createClient.mockReturnValue({
    realtime: { setAuth: mocks.setAuth, disconnect: mocks.disconnect },
    channel: mocks.channel.mockReturnValue(channel),
    removeChannel: mocks.removeChannel,
  });
  fetchToken = vi.fn().mockImplementation(async () => Response.json(info));
  vi.stubGlobal("fetch", fetchToken);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function connect() {
  cleanup = subscribeChanges(vi.fn());
  await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
}

function tokenProvider(): () => Promise<string> {
  return mocks.createClient.mock.calls[0]![2].accessToken;
}

describe("private Realtime authentication", () => {
  it("supplies the Catetin JWT when the SDK refreshes auth after joining or reconnecting", async () => {
    await connect();

    expect(tokenProvider()).toBeTypeOf("function");
    await expect(tokenProvider()()).resolves.toBe(info.token);
    expect(mocks.channel).toHaveBeenCalledWith(info.topic, { config: { private: true } });
  });

  it("updates the SDK token provider when the Catetin JWT is renewed", async () => {
    await connect();
    fetchToken.mockImplementation(async () => Response.json({ ...info, token: "renewed-user-jwt" }));

    await vi.advanceTimersByTimeAsync(50 * 60_000);

    expect(mocks.setAuth).toHaveBeenLastCalledWith("renewed-user-jwt");
    await expect(tokenProvider()()).resolves.toBe("renewed-user-jwt");
  });

  it("stops renewing and removes the channel after the component unmounts", async () => {
    await connect();
    cleanup!();
    cleanup = undefined;

    await vi.advanceTimersByTimeAsync(50 * 60_000);

    expect(fetchToken).toHaveBeenCalledOnce();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });

  it("does not open a channel if unmounted while its initial authentication is pending", async () => {
    let finishAuth!: () => void;
    mocks.setAuth.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAuth = resolve;
        }),
    );
    cleanup = subscribeChanges(vi.fn());
    await vi.waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce());
    cleanup();
    cleanup = undefined;
    finishAuth();
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());

    expect(mocks.channel).not.toHaveBeenCalled();
  });
});
