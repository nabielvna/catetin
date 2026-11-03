export type DeviceKind = "phone" | "tablet" | "desktop";
export type DeviceInfo = { browser: string | null; os: string | null; kind: DeviceKind };

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? "";
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s))
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /CrOS/.test(s)
          ? "ChromeOS"
          : /Windows/.test(s)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(s)
              ? "macOS"
              : /Linux/.test(s)
                ? "Linux"
                : null;

  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser\//.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS\//.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : null;
  const kind: DeviceKind =
    os === "iPad" || (os === "Android" && !/Mobile/.test(s))
      ? "tablet"
      : os === "iPhone" || os === "Android"
        ? "phone"
        : "desktop";
  return { browser, os, kind };
}

export function displayIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const groups = ip.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
    if (groups.every((g) => g === "0" || g === "")) return null;
    const joined = groups.join(":").replace(/(^|:)(0(:|$)){2,}/, "::");
    return joined === "::1" ? null : joined;
  }
  return ip.startsWith("127.") ? null : ip;
}
