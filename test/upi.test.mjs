// UPI reward self-check: run `node test/upi.test.mjs`.
// RuPay UPI credit lines earn DEFAULT on UPI; other cards earn 0.
import { readFileSync } from "node:fs";
import { recommend, rewardFor } from "../src/engine/recommend.js";
import { ACTIONS } from "../src/engine/actions.js";

const d = JSON.parse(readFileSync(new URL("../src/data/cards.json", import.meta.url)));
const card = (key) => d.cards.find((c) => c.cardKey === key);

const UPI = ACTIONS.find((a) => a.category === "UPI");
const app = UPI.apps[0];

const slice = card("slice");
const sbi = card("sbi-phonepe-select-black");
const visa = card("hdfc-swiggy"); // Visa — earns nothing on UPI

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} -> ${JSON.stringify(got)}`);
};

const r1 = rewardFor(slice, UPI, app);
check("slice UPI 1% no cap", { rate: r1.ratePct, cap: r1.monthlyCapRs }, { rate: 1, cap: null });

const r2 = rewardFor(sbi, UPI, app);
check("sbi select black UPI 1% cap 2000", { rate: r2.ratePct, cap: r2.monthlyCapRs }, { rate: 1, cap: 2000 });

check("visa UPI nothing", rewardFor(visa, UPI, app), null);

const pick = recommend([slice, sbi, visa], UPI, app)[0];
check("slice beats sbi on UPI", { card: pick.card.cardKey, cap: pick.cap }, { card: "slice", cap: null });

// Cap depletes: 2100 already on sbi DEFAULT -> remaining 0 (card kept,
// App shows the full CapMeter; recommend never drops a card).
const spent = { "sbi-phonepe-select-black:DEFAULT": 2100 };
const sbiAfter = recommend([sbi], UPI, app, spent)[0];
check("sbi cap exhausted", { cap: sbiAfter.cap, remaining: sbiAfter.remaining }, { cap: 2000, remaining: 0 });

process.exit(fail ? 1 : 0);
