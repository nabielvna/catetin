import { expect, it } from "vitest";

import { setDebtLabels } from "@/services/labels";
import { search } from "@/services/search";

import { debt, makeUser, manual, record } from "../helpers/factories";

it("finds labeled debts only for the user who assigned the label", async () => {
  const owner = await makeUser("SearchOwner");
  const other = await makeUser("SearchOther");
  const person = await manual(owner, "Contact");
  const saved = await record(owner, debt(owner, person.partyId, 500, { title: "Used phone" }));
  await setDebtLabels(owner, { obligationId: saved.id, names: ["gadget"] });
  expect((await search(owner.actor, "", "gadget")).debts.map((d) => d.id)).toEqual([saved.id]);
  expect((await search(owner.actor, "#gadget")).debts.map((d) => d.id)).toEqual([saved.id]);
  expect((await search(other.actor, "", "gadget")).debts).toEqual([]);
});
