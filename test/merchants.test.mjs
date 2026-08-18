// Merchant classification self-check: run `node --test test/`.
import { merchantCategory } from "../src/engine/merchants.js";

let fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} → ${got}`);
};

// Wallet-channel spends: refs from wallet apps stay WALLET (user-verified
// behavior), glued wallet names match, unrelated vendors unaffected.
check("payzapp spend ref is wallet", merchantCategory("PAYZAPPW7495373"), "WALLET");
check("payzapp plain is wallet", merchantCategory("PAYZAPP"), "WALLET");
check("payzapp-wallet glued is wallet", merchantCategory("PAYZAPPWALLET"), "WALLET");
check("hdfc-payzapp-wallet glued is wallet", merchantCategory("HDFCPAYZAPPWALLET"), "WALLET");
check("mobikwik spend ref is wallet", merchantCategory("MOBIKWIKW1234"), "WALLET");
check("mobikwik-wallet glued is wallet", merchantCategory("MOBIKWIKWALLET"), "WALLET");

// Existing behavior must not regress.
check("swiggy boundary", merchantCategory("SWIGGY LIMITED"), "DINING");
check("gyftr prefix ref", merchantCategory("GYFTRSM12139725"), "ONLINE_SHOPPING");
check("airtel word wins over channel", merchantCategory("AIRTEL"), "UTILITY_BILLS");
check("upi stays null", merchantCategory("UPI"), null);

process.exit(fail ? 1 : 0);