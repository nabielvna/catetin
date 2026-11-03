import { describe, expect, it } from "vitest";

import { isConfident, nameScore, phoneticKey, rankCandidates } from "@/lib/name-matching";

describe("name matching", () => {
  it.each([
    ["Sinta", "Shinta"],
    ["Yusuf", "Jusuf"],
    ["Yusuf", "Yoesoef"],
    ["Fitri", "Vitri"],
    ["Cahya", "Tjahja"],
    ["Ani", "Anie"],
    ["Zaki", "Saki"],
    ["Rizky", "Riski"],
  ])("%s ≈ %s", (a, b) => {
    expect(phoneticKey(a)).toBe(phoneticKey(b));
  });

  it("short nicknames & second word", () => {
    expect(nameScore("budi", "Budiman Santoso")).toBeGreaterThanOrEqual(0.85);
    expect(nameScore("santoso", "Budi Santoso")).toBe(1);
  });

  it("light typos", () => {
    expect(nameScore("citrra", "Citra")).toBeGreaterThan(0.6);
  });

  it("different names don't match", () => {
    expect(nameScore("budi", "Citra")).toBeLessThan(0.6);
  });

  it("frequency breaks ties & confidence", () => {
    const ranked = rankCandidates("budi", [
      { id: "a", names: ["Budi Kantor"], frequency: 1 },
      { id: "b", names: ["Budi Santoso"], frequency: 20 },
      { id: "c", names: ["Citra"], frequency: 50 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "a"]);
    expect(isConfident(ranked)).toBe(false);
    expect(isConfident(rankCandidates("budi santoso", [{ id: "b", names: ["Budi Santoso"], frequency: 1 }]))).toBe(
      true,
    );
  });

  it("learned aliases are matched too", () => {
    const ranked = rankCandidates("mas bro", [{ id: "x", names: ["Eko Prasetyo", "mas bro"], frequency: 0 }]);
    expect(ranked[0]?.id).toBe("x");
  });
});
