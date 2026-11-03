import type { AppLocale } from "@/i18n/routing";

export function switchLocale(locale: AppLocale, next: string) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/api/locale?to=${locale}&next=${encodeURIComponent(next)}`);
}
