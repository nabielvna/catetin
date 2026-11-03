import { expect, it } from "vitest";

import { csvCell } from "@/lib/csv";

it("quotes embedded quotes and preserves line breaks", () => {
  expect(csvCell('one "two"\nthree')).toBe('"one ""two""\nthree"');
  expect(csvCell(null)).toBe('""');
});
it("prevents spreadsheet formulas from user-controlled text", () => {
  for (const text of ["=SUM(A1:A2)", "+cmd", "-1", "@A1", "\t=1", "\r=1"]) {
    expect(csvCell(text)).toBe(`"'${text}"`);
  }
});
