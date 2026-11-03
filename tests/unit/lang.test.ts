import { describe, expect, it } from "vitest";

import { detectLang } from "@/lib/detect-language";

describe("guess the assistant message language (D-93)", () => {
  it("everyday Indonesian sentences", () => {
    for (const s of [
      "ada yang perlu aku setujui?",
      "Budi pinjem 50rb buat bensin kemarin",
      "td makan dibayarin Sinta 35rb",
      "iya setujui",
      "hapus utang bensin dodi",
      "50rb",
    ])
      expect(detectLang(s), s).toBe("id");
  });

  it("English sentences", () => {
    for (const s of [
      "Budi borrowed 50k for gas",
      "who hasn't paid me yet?",
      "I paid Citra 100k",
      "yes please approve it",
    ])
      expect(detectLang(s), s).toBe("en");
  });

  it("unclear → null (follows the previous language / app language)", () => {
    for (const s of ["50000", "Budi", "", "ok", "(pesan suara)"]) expect(detectLang(s), s).toBeNull();
  });
});
