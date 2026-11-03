import { describe, expect, it } from "vitest";

import { displayIp, parseUserAgent } from "@/lib/user-agent";

describe("parseUserAgent (D-68)", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
      { browser: "Chrome", os: "Android", kind: "phone" },
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      { browser: "Safari", os: "iPhone", kind: "phone" },
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      { browser: "Safari", os: "iPad", kind: "tablet" },
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0",
      { browser: "Edge", os: "Windows", kind: "desktop" },
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36",
      { browser: "Samsung Internet", os: "Android", kind: "phone" },
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      { browser: "Firefox", os: "Linux", kind: "desktop" },
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      { browser: "Chrome", os: "macOS", kind: "desktop" },
    ],
  ])("%s", (ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected);
  });

  it("no user agent → unknown", () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, kind: "desktop" });
  });
});

describe("displayIp (D-69)", () => {
  it.each([
    ["2001:448a:20b1:64c6:0000:0000:0000:0000", "2001:448a:20b1:64c6::"],
    ["0000:0000:0000:0000:0000:0000:0000:0000", null],
    ["::1", null],
    ["::", null],
    ["127.0.0.1", null],
    ["103.10.64.12", "103.10.64.12"],
    [null, null],
  ])("%s → %s", (ip, expected) => {
    expect(displayIp(ip)).toBe(expected);
  });
});
