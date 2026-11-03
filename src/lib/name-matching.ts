export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function phoneticKey(word: string): string {
  let w = normalize(word).replace(/ /g, "");
  w = w
    .replace(/dj/g, "j")
    .replace(/tj/g, "c")
    .replace(/sj/g, "sy")
    .replace(/oe/g, "u")
    .replace(/ch/g, "k")
    .replace(/kh/g, "k")
    .replace(/sh/g, "s")
    .replace(/sy/g, "s")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/v/g, "f")
    .replace(/w/g, "u")
    .replace(/^y/, "j")
    .replace(/(?<=[aeiou])y(?=[aeiou])/g, "j")
    .replace(/(?<=[aeiou]h)y(?=[aeiou])/g, "j")
    .replace(/y/g, "i")
    .replace(/ck/g, "k")
    .replace(/h(?![aeiou])/g, "")
    .replace(/(.)\1+/g, "$1");

  return w.replace(/ie$/, "i").replace(/[aeiou]+$/, (m) => m[0]!);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export function nameScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const qWords = q.split(" ");
  const cWords = c.split(" ");
  let total = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const cw of cWords) {
      let s = 0;
      if (qw === cw) s = 1;
      else if (cw.startsWith(qw) && qw.length >= 3) s = 0.9;
      else if (phoneticKey(qw) === phoneticKey(cw)) s = 0.88;
      else {
        const pk = phoneticKey(qw);
        const ck = phoneticKey(cw);
        if (ck.startsWith(pk) && pk.length >= 3) s = 0.8;
        else {
          const d = levenshtein(qw, cw);
          const maxLen = Math.max(qw.length, cw.length);
          const sim = 1 - d / maxLen;
          if (sim >= 0.6) s = sim * 0.85;
        }
      }
      best = Math.max(best, s);
    }
    total += best;
  }
  return total / qWords.length;
}

export type NameCandidate = { id: string; names: string[]; frequency: number };

export function rankCandidates(query: string, candidates: readonly NameCandidate[], threshold = 0.6) {
  const maxFreq = Math.max(1, ...candidates.map((c) => c.frequency));
  return candidates
    .map((c) => {
      const score = Math.max(...c.names.map((n) => nameScore(query, n)));
      return { id: c.id, score, rank: score + 0.05 * (c.frequency / maxFreq) };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.rank - a.rank);
}

export function isConfident(ranked: ReadonlyArray<{ score: number; rank: number }>): boolean {
  const [a, b] = ranked;
  if (!a) return false;
  if (a.score >= 0.95 && (!b || b.score < 0.95)) return true;
  return a.score >= 0.85 && (!b || a.rank - b.rank >= 0.12);
}
