"use client";

type Brand = { brand: string };
type UAData = { brands?: Brand[]; getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };

const BRANDS: Record<string, string> = {
  "Google Chrome": "Chrome",
  "Microsoft Edge": "Edge",
  "Brave": "Brave",
  "Opera": "Opera",
  "Samsung Internet": "Samsung Internet",
  "Yandex": "Yandex",
  "Vivaldi": "Vivaldi",
};

export async function readClientHints(): Promise<{ model: string | null; browser: string | null } | null> {
  const uad = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (!uad) return null;
  const brand = uad.brands?.map((b) => b.brand).find((b) => BRANDS[b]);
  let model: string | null = null;
  try {
    model = (await uad.getHighEntropyValues?.(["model"]))?.model?.trim() || null;
  } catch {}
  return { model, browser: brand ? BRANDS[brand]! : null };
}
