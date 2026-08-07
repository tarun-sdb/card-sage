// Engine self-check: run `node test/engine.test.mjs`.
// Fails loudly if scoping rules break.
import { readFileSync } from "node:fs";
import { recommend } from "../src/engine/recommend.js";
import { ACTIONS } from "../src/engine/actions.js";

const d = JSON.parse(readFileSync(new URL("../src/data/cards.json", import.meta.url)));
const wallet = d.cards.filter((c) =>
  ["hdfc-phonepe-ultimo", "hdfc-swiggy", "icici-amazon-pay", "icici-hpcl-coral"].includes(c.cardKey)
);

const act = (id) => ACTIONS.find((a) => a.id === id);
const app = (aid, appid) => act(aid).apps.find((a) => a.id === appid);
const top = (aid, appid) => recommend(wallet, act(aid), app(aid, appid))[0];

const cases = [
  ["recharge@phonepe gives Ultimo 10%", top("mobile-recharge", "phonepe"), "PhonePe HDFC Bank Ultimo", 10],
  ["recharge@paytm NOT 10% (scoped)", top("mobile-recharge", "paytm"), "PhonePe HDFC Bank Ultimo", 1],
  ["dining@swiggy gives Swiggy 10%", top("dining", "swiggy"), "Swiggy HDFC", 10],
  ["dining@zomato NOT Swiggy 10% (scoped)", top("dining", "zomato"), "Swiggy HDFC", 1, "rate"],
  ["fuel gives HPCL Coral 2.5%", top("fuel", "pump"), "HPCL Coral", 2.5],
  ["online@amazon gives Ultimo 5%", top("online-shopping", "amazon"), "PhonePe HDFC Bank Ultimo", 5],
];

let fail = 0;
for (const [name, pick, cardSubstr, expectPct, mode] of cases) {
  const cardOk = mode === "rate" ? true : pick && pick.card.name.includes(cardSubstr);
  const pctOk = pick && Math.abs(pick.reward.netPct - expectPct) < 0.01;
  const ok = cardOk && pctOk;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} -> ${pick ? pick.card.name + " " + pick.reward.netPct + "%" : "none"}`);
}
process.exit(fail ? 1 : 0);
