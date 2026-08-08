import { merchantCategory } from '../src/engine/merchants.js';
const cases = [
  ["SWIGGY", "DINING"], ["AMAZON PAY", "ONLINE_SHOPPING"], ["AMAZON PAY IZMOBILE", "ONLINE_SHOPPING"],
  ["MAKEMYTRIP.COM", "TRAVEL"], ["BPCL", "FUEL"], ["PHONEPE", "UTILITY_BILLS"],
  ["NETFLIX", "OTT_SUBSCRIPTIONS"], ["BIGBASKET", "GROCERY"], ["LIC", "INSURANCE"],
  ["NOBROKER", "RENT"], ["BYJUS", "EDUCATION"], ["UNKNOWN SHOP XYZ", null],
];
let fail = 0;
for (const [m, expect] of cases) {
  const got = merchantCategory(m);
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${m} -> ${got} (expect ${expect})`);
}
process.exit(fail ? 1 : 0);
