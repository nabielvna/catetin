export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/dj/g, "j")
    .replace(/tj/g, "c")
    .replace(/oe/g, "u")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/kh/g, "k")
    .replace(/y\b/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesName(name: string, query: string): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  const n = normalizeName(name);
  return n.includes(q) || n.split(" ").some((w) => w.startsWith(q));
}
