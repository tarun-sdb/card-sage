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

// Research-backed expansion (2026-09-08): inferred bank-descriptor patterns.
check("cred bill pay", merchantCategory("CRED"), "UTILITY_BILLS");
check("cred via phrase", merchantCategory("PAID VIA CRED"), "UTILITY_BILLS");
check("credit mentions unaffected", merchantCategory("CREDIT CARD"), "ONLINE_SHOPPING");
check("tatacliq glued", merchantCategory("TATACLIQ"), "ONLINE_SHOPPING");
check("tata cliq spaced", merchantCategory("TATA CLIQ"), "ONLINE_SHOPPING");
check("shoppers stop", merchantCategory("SHOPPERS STOP"), "ONLINE_SHOPPING");
check("shoppersstop glued", merchantCategory("SHOPPERSSTOP"), "ONLINE_SHOPPING");
check("delhivery", merchantCategory("DELHIVERY"), "UTILITY_BILLS");
check("airtel payments bank", merchantCategory("AIRTEL PAYMENTS BANK"), "UTILITY_BILLS");
check("airtel pb", merchantCategory("AIRTEL PB"), "UTILITY_BILLS");
check("auto debit", merchantCategory("AUTO DEBIT"), "UTILITY_BILLS");
check("autodebit glued", merchantCategory("AUTODEBIT"), "UTILITY_BILLS");
check("emi", merchantCategory("EMI"), "UTILITY_BILLS");
check("emi inside merchant keeps merchant", merchantCategory("NO COST EMI AT AMAZON"), "ONLINE_SHOPPING");
check("premium not emi", merchantCategory("PREMIUM"), "ONLINE_SHOPPING");
check("blinkit glued ref", merchantCategory("BLINKIT12345"), "GROCERY");
check("bigbasket ref", merchantCategory("BIGBASKET99"), "GROCERY");

process.exit(fail ? 1 : 0);