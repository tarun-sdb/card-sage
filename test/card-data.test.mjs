// Data-layer self-check: run `node --test test/`.
import { validateCards } from "../src/engine/card-data.js";

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};

check("valid payload passes", validateCards({ cards: [{ cardKey: "a", name: "A", rewards: [] }] })?.length, 1);
check("missing cardKey rejected", validateCards({ cards: [{ name: "A", rewards: [] }] }), null);
check("non-array rejected", validateCards({ cards: "x" }), null);
check("empty rejected", validateCards({ cards: [] }), null);
check("missing rewards rejected", validateCards({ cards: [{ cardKey: "a", name: "A" }] }), null);
check("missing payload rejected", validateCards(undefined), null);

process.exit(fail ? 1 : 0);
