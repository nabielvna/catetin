export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);

  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
