import { describe, expect, it } from "vitest";

import { hostAllowed } from "@/lib/server/app-url";

const patterns = ["catetin.app", "localhost:*", "*.ngrok-free.app"];

describe("hostAllowed", () => {
  it("accepts exact hosts & wildcard matches", () => {
    expect(hostAllowed("catetin.app", patterns)).toBe(true);
    expect(hostAllowed("localhost:3001", patterns)).toBe(true);
    expect(hostAllowed("New-Merry-Elephant.ngrok-free.app", patterns)).toBe(true);
  });

  it("rejects other hosts & spoofing tricks", () => {
    expect(hostAllowed("evil.com", patterns)).toBe(false);
    expect(hostAllowed("catetin.app.evil.com", patterns)).toBe(false);
    expect(hostAllowed("ngrok-free.app.evil.com", patterns)).toBe(false);
    expect(hostAllowed("evil.com/x.ngrok-free.app", patterns)).toBe(false);
    expect(hostAllowed("user@x.ngrok-free.app", patterns)).toBe(false);
    expect(hostAllowed("localhost.evil.com", patterns)).toBe(false);
  });
});
