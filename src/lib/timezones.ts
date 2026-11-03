const INDONESIA: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function tzName(tz: string): string {
  const city = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  return INDONESIA[tz] ? `${city} (${INDONESIA[tz]})` : city;
}

export function tzOffset(tz: string, now = new Date()): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

export function timezoneOptions(
  current: string,
): Array<{ value: string; label: string; hint: string; keywords: string }> {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {}
  const now = new Date();
  return [...new Set([current, "UTC", ...zones])]
    .map((z) => {
      const area = z.includes("/") ? z.split("/")[0]!.replace(/_/g, " ") : "";
      const offset = tzOffset(z, now);
      return {
        value: z,
        label: tzName(z),
        hint: [offset, area].filter(Boolean).join(" · "),
        keywords: `${z} ${INDONESIA[z] ? "Indonesia" : ""}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
