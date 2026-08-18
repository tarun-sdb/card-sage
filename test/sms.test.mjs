// SMS parser self-check: run `node --test test/`.
import { parseSms } from "../src/engine/sms.js";

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} → ${JSON.stringify(got)}`);
};

const t = (sender, body) => parseSms(sender, body);

// Marketing ads must NOT become transactions ("Postpaid" = paid inside
// a compound word; the Rs. amount is plan copy, not a spend).
check(
  "airtel postpaid ad rejected",
  t("AT-650025-P", "Get the best speeds, powered by Fast lane Tech. That's the Postpaid advantage. Enjoy Unlimited 4G + 5G data, 20+ OTTs, and more at just Rs. 449 + taxes. Upgrade now https://i.airtel.in/exhaust50_2"),
  null
);
check(
  "prepaid ad rejected",
  t("AD-JIO", "Recharge now — get 2GB/day on Prepaid plans starting Rs. 299"),
  null
);

// Real bank alerts still parse.
check(
  "hdfc card spend",
  t("AD-HDFCBK-S", "Spent Rs.4000 From HDFC Bank Card x1665 At PAYZAPPW7495373 On 2026-08-16:22:07:20 Bal Rs.4235.84"),
  { sender: "AD-HDFCBK-S", amount: 4000, cardLast4: "1665", merchant: "PAYZAPPW7495373", bank: "HDFC BANK" }
);
check(
  "bank recharge alert kept",
  (() => { const r = t("SBIPHON", "Rs.249 recharged for 98xxxx via UPI"); return r && r.merchant; })(),
  "RECHARGE"
);
check(
  "operator recharge dropped (dup)",
  t("AD-AIRTEL", "Your Airtel recharge of Rs.249 is successful"),
  null
);
check(
  "credit alert rejected",
  t("AD-HDFCBK-S", "Rs.1000 credited to your account. Txn ID 1234"),
  null
);

process.exit(fail ? 1 : 0);