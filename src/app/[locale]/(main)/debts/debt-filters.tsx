import { getTranslations } from "next-intl/server";

import { type FacetView } from "@/app/[locale]/(main)/records/record-filters";
import { categoryOf, facetCounts, RECORD_STATUSES, type RecordFilter, type RecordRow } from "@/domain/records";

export async function debtFacets(all: RecordRow[], filter: RecordFilter, locale: string) {
  const [t, tc] = await Promise.all([getTranslations("records"), getTranslations("categories")]);
  const counts = facetCounts(all, filter);

  const keep = (value: string, count: number | undefined, selected: string[]) =>
    (count ?? 0) > 0 || selected.includes(value);
  const named = new Map<string, string>();
  const groups = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const r of all) {
    named.set(r.counterpartId, r.counterpartName);
    if (r.groupId) groups.set(r.groupId, r.groupName ?? "?");
    for (const l of r.labels) if (!labels.has(l.toLowerCase())) labels.set(l.toLowerCase(), l);
  }
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, locale);
  const currencies = [...new Set(all.map((r) => r.currency))];
  const categories = [...new Set(all.map(categoryOf))];

  const facets: FacetView[] = [
    {
      key: "status",
      title: t("facets.status"),
      disjoint: true,
      options: RECORD_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`), count: counts.status.get(s) ?? 0 })),
    },
    {
      key: "dir",
      title: t("facets.dir"),
      disjoint: true,
      options: (["THEY_OWE", "I_OWE"] as const).map((d) => ({
        value: d,
        label: t(`dir.${d}`),
        count: counts.dir.get(d) ?? 0,
      })),
    },
    {
      key: "people",
      title: t("facets.people"),
      disjoint: true,
      options: [...named]
        .map(([value, label]) => ({ value, label, count: counts.people.get(value) ?? 0 }))
        .filter((o) => keep(o.value, o.count, filter.people))
        .sort(byLabel),
    },
    {
      key: "groups",
      title: t("facets.groups"),
      disjoint: true,
      options: [...groups]
        .map(([value, label]) => ({ value, label, count: counts.groups.get(value) ?? 0 }))
        .filter((o) => keep(o.value, o.count, filter.groups))
        .sort(byLabel),
    },
    {
      key: "labels",
      title: t("facets.labels"),
      disjoint: false,
      options: [...labels]
        .map(([key, label]) => ({ value: label, label: `#${label}`, count: counts.labels.get(key) ?? 0 }))
        .filter((o) => keep(o.value, o.count, filter.labels))
        .sort(byLabel),
    },
    {
      key: "categories",
      title: t("facets.categories"),
      disjoint: true,
      options: categories
        .map((c) => ({ value: c, label: tc(c as "OTHER"), count: counts.categories.get(c) ?? 0 }))
        .filter((o) => keep(o.value, o.count, filter.categories))
        .sort(byLabel),
    },
    {
      key: "currencies",
      title: t("facets.currencies"),
      disjoint: true,
      options: currencies
        .map((c) => ({ value: c, label: c, count: counts.currencies.get(c) ?? 0 }))
        .filter((o) => keep(o.value, o.count, filter.currencies)),
    },
  ];

  const shown = facets.filter((f) => {
    if (f.key === "status" || filter[f.key].length > 0) return true;
    return f.options.length >= (f.key === "groups" || f.key === "labels" ? 1 : 2);
  });

  return shown;
}
