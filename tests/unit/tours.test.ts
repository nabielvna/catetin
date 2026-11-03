import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import id from "@/i18n/messages/id.json";
import { currentStep, onTourPath, resolvePath, targetsOf, type Tour, TOUR_IDS, TOURS } from "@/lib/tours";

const tours = Object.entries(TOURS) as Array<[string, Tour]>;

function itemsOf(msgs: typeof id) {
  const groups = msgs.tour.items as Record<string, Record<string, Record<string, string>>>;
  return Object.fromEntries(
    Object.entries(groups).flatMap(([g, items]) => Object.entries(items).map(([n, it]) => [`${g}.${n}`, it])),
  );
}

function markers() {
  const literals = new Set<string>();
  const patterns: RegExp[] = [];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
    });
  for (const file of walk("src")) {
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(
      /(?:data-tour|\btour)=(?:"([^"]+)"|\{((?:[^{}]|\$\{[^}]*\})*)\})|\btour: "([^"]+)"/g,
    )) {
      const expr = m[1] ?? m[3] ?? m[2] ?? "";
      if (m[1] || m[3]) literals.add(expr);
      for (const s of expr.matchAll(/"([^"]+)"/g)) literals.add(s[1]!);
      for (const s of expr.matchAll(/`([^`]+)`/g))
        patterns.push(new RegExp(`^${s[1]!.replace(/\./g, "\\.").replace(/\$\{[^}]+\}/g, "[\\w-]+")}$`));
    }
  }
  return { has: (t: string) => literals.has(t) || patterns.some((p) => p.test(t)) };
}

describe("guide catalog (D-106)", () => {
  it("every highlighted element has a data-tour marker in the code", () => {
    const { has } = markers();
    const missing = tours.flatMap(([tid, t]) =>
      t.steps.flatMap((s) =>
        targetsOf(s)
          .filter((x) => !has(x))
          .map((x) => `${tid} → ${x}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it("id & en text complete: title, one sentence per step, example & prefix for Option 2", () => {
    for (const msgs of [id, en]) {
      const items = itemsOf(msgs);
      expect(Object.keys(items).sort()).toEqual([...TOUR_IDS].sort());
      for (const [tid, t] of tours) {
        const it = items[tid]!;
        const expected = [
          "title",
          ...t.steps.map((_, i) => `s${i + 1}`),
          ...(t.assist ? ["ask", "prefix"] : []),
        ].sort();
        expect(Object.keys(it).sort(), tid).toEqual(expected);
      }
    }
  });

  it("{name}/{group} in the text only for guides that actually know the person/group", () => {
    for (const msgs of [id, en]) {
      const items = itemsOf(msgs);
      for (const [tid, t] of tours) {
        const text = Object.values(items[tid]!).join(" ");
        for (const v of text.matchAll(/\{(\w+)\}/g)) {
          const need = v[1] === "name" ? "partyId" : v[1] === "group" ? "groupId" : null;
          expect(need, `${tid}: {${v[1]}}`).not.toBeNull();
          expect(t.needs, `${tid}: {${v[1]}}`).toBe(need);
        }
      }
    }
  });

  it("guides that need a person/group/debt open their page themselves", () => {
    for (const [tid, t] of tours) {
      if (!t.needs) continue;
      expect(t.start, tid).toBeDefined();
      expect(resolvePath(t.start!, { [t.needs]: "x" }), tid).not.toBeNull();
    }
  });
});

describe("steps read from the screen", () => {
  const rename = TOURS["person.rename"];
  const budi = { partyId: "b" };
  const on =
    (...targets: string[]) =>
    (t: string) =>
      targets.includes(t);

  it("the last visible step on the right page", () => {
    expect(currentStep(rename, budi, "/people/b", on("person.menu"))).toBe(0);
    expect(currentStep(rename, budi, "/people/b", on("person.menu", "person.menu.rename"))).toBe(1);
    expect(currentStep(rename, budi, "/people/b", on("person.menu", "person.rename.form"))).toBe(2);

    expect(currentStep(rename, budi, "/people/b", on("person.menu"))).toBe(0);
  });

  it("another person's page doesn't count", () => {
    expect(currentStep(rename, budi, "/people/c", on("person.menu"))).toBe(-1);
  });

  it("global steps (+) apply anywhere; start mid-way when already in the form", () => {
    const debt = TOURS["debt.create"];
    expect(currentStep(debt, {}, "/home", on("nav.new"))).toBe(0);
    expect(currentStep(debt, {}, "/people/b", on("nav.new", "person.record"))).toBe(1);
    expect(currentStep(debt, {}, "/debts/new", on("nav.new", "debt.submit"))).toBe(2);
  });

  it("a `gate` choice must be tapped before the Save button applies", () => {
    const inst = TOURS["debt.installments"];
    const form = on("nav.new", "debt.plan.installments", "debt.submit");
    expect(currentStep(inst, {}, "/debts/new", form)).toBe(2);
    expect(currentStep(inst, {}, "/debts/new", form, new Set([2]))).toBe(3);
  });

  it("moving to a page outside its steps = off track", () => {
    expect(onTourPath(rename, budi, "/people/b")).toBe(true);
    expect(onTourPath(rename, budi, "/inbox")).toBe(false);
    expect(onTourPath(TOURS["debt.create"], {}, "/debts/new")).toBe(true);
    expect(onTourPath(TOURS["debt.create"], {}, "/groups")).toBe(false);
  });
});
