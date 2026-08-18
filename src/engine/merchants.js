// Merchant name (from SMS) -> reward category. Seed list for common India
// merchants; unknown merchants fall through to manual pick (app UI).
const MAP = {
  // food delivery / dining
  SWIGGY: "DINING", ZOMATO: "DINING", "EASYDINER": "DINING", "DINEOUT": "DINING",
  "SWIGGY INSTAMART": "DINING", "ZOMATO EATS": "DINING",
  MCDONALDS: "DINING", DOMINOS: "DINING", KFC: "DINING", "BURGER KING": "DINING",
  STARBUCKS: "DINING", "BARBEQUE NATION": "DINING",
  // online shopping
  AMAZON: "ONLINE_SHOPPING", "AMAZON PAY": "ONLINE_SHOPPING", AMZN: "ONLINE_SHOPPING",
  FLIPKART: "ONLINE_SHOPPING", MYNTRA: "ONLINE_SHOPPING", AJIO: "ONLINE_SHOPPING",
  "NYKAA": "ONLINE_SHOPPING", "MEESHO": "ONLINE_SHOPPING", "SNACKS": "ONLINE_SHOPPING",
  "SMYTTEN": "ONLINE_SHOPPING", "GYFTR": "ONLINE_SHOPPING",
  // travel
  "MAKEMYTRIP": "TRAVEL", MMT: "TRAVEL", "MAKEMYTRIP.COM": "TRAVEL",
  GOIBIBO: "TRAVEL", IRCTC: "TRAVEL", "YATRA": "TRAVEL", "EASEMYTRIP": "TRAVEL",
  "AIR INDIA": "TRAVEL", "INDIGO": "TRAVEL", "SPICEJET": "TRAVEL", UBER: "TRAVEL",
  OLA: "TRAVEL", "OLA CABS": "TRAVEL", REDBUS: "TRAVEL", "IRCTC RAIL": "TRAVEL",
  // fuel
  BPCL: "FUEL", IOCL: "FUEL", "INDIAN OIL": "FUEL", HPCL: "FUEL", "HINDUSTAN PETROLEUM": "FUEL",
  "SHELL": "FUEL", "NAYARA ENERGY": "FUEL",
  // utility
  "PHONEPE": "UTILITY_BILLS", PAYTM: "UTILITY_BILLS", "GOOGLE PAY": "UTILITY_BILLS",
  "GPAY": "UTILITY_BILLS", "JIO": "UTILITY_BILLS", "JIOFIBER": "UTILITY_BILLS",
  AIRTEL: "UTILITY_BILLS", "AIRTEL DIGITAL TV": "UTILITY_BILLS", VI: "UTILITY_BILLS",
  "VODAFONE": "UTILITY_BILLS", "BSES": "UTILITY_BILLS", "TATA POWER": "UTILITY_BILLS",
  "ADANI ELECTRICITY": "UTILITY_BILLS", "MSEB": "UTILITY_BILLS", "CESC": "UTILITY_BILLS",
  "RECHARGE": "UTILITY_BILLS", "MOBILE RECHARGE": "UTILITY_BILLS", "PREPAID RECHARGE": "UTILITY_BILLS",
  // grocery
  "BIGBASKET": "GROCERY", "DMART": "GROCERY", "BLINKIT": "GROCERY", "ZEECO": "GROCERY",
  "GROFERS": "GROCERY", "RELIANCE FRESH": "GROCERY", "MORE": "GROCERY",
  // ott / entertainment
  NETFLIX: "OTT_SUBSCRIPTIONS", "AMAZON PRIME": "OTT_SUBSCRIPTIONS", HOTSTAR: "OTT_SUBSCRIPTIONS",
  "DISNEY+": "OTT_SUBSCRIPTIONS", "SONY LIV": "OTT_SUBSCRIPTIONS", "SPOTIFY": "OTT_SUBSCRIPTIONS",
  // insurance
  "LIC": "INSURANCE", "HDFC ERGO": "INSURANCE", "ICICI LOMBARD": "INSURANCE",
  "BAJAJ ALLIANZ": "INSURANCE", "ACKO": "INSURANCE", "POLICYBAZAAR": "INSURANCE",
  // rent
  "NOBROKER": "RENT", "HOUSING.COM": "RENT", "MAGICBRICKS": "RENT", "PAYTM RENT": "RENT",
  // wallet loads
  "PAYZAPP": "WALLET", "MOBIKWIK": "WALLET", "FREECHARGE": "WALLET",
  // education
  "BYJUS": "EDUCATION", "VEDANTU": "EDUCATION", "UPGRAD": "EDUCATION", "UNACADEMY": "EDUCATION",
};

// Normalize: uppercase, collapse dots/whitespace. "makemytrip.com" -> "MAKEMYTRIP COM".
function normalize(name) {
  return (name || "").toUpperCase().replace(/[.\s]+/g, " ").trim();
}

// Escape regex specials in MAP keys (e.g. "DISNEY+").
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function merchantCategory(merchant) {
  if (!merchant) return null;
  const n = normalize(merchant);
  if (MAP[n]) return MAP[n];
  // Word-boundary substring match: "SWIGGY LIMITED" -> DINING,
  // "WWW AMAZON IN" -> ONLINE_SHOPPING.
  for (const key of Object.keys(MAP)) {
    if (new RegExp(`\\b${esc(key)}\\b`).test(n)) return MAP[key];
  }
  // Wallet merchant names glue ("PAYZAPPWALLET", "HDFCPAYZAPPWALLET") — match
  // only when the string literally names the wallet. Reference runs
  // ("PAYZAPPW7495373") are card spends at an unknown merchant; they fall
  // through to the catch-all, never to WALLET.
  for (const key of ["PAYZAPP", "MOBIKWIK", "FREECHARGE"]) {
    if (n.includes(key) && n.includes("WALLET")) return MAP[key];
  }
  // Merchants ship txn/order refs glued on ("GYFTRSM12139725", "SWIGGY99123").
  // Digits are never part of a merchant name — strip the trailing digit-run
  // once and re-run the boundary pass. This resolves every ref-carrying
  // merchant for keys already in MAP; nothing loses (no digit-bearing names).
  const stripped = n.replace(/\d+.*$/, "");
  if (stripped && stripped !== n) {
    for (const key of Object.keys(MAP)) {
      if (new RegExp(`\\b${esc(key)}\\b`).test(stripped)) return MAP[key];
    }
    // Prefix names ("GYFTRSM" starts with GYFTR — no boundary before S).
    // Longest key first so short keys can't win ("GYFTR" beats "G").
    // Wallet keys are excluded: "PAYZAPPW" ref-artifacts are not wallets.
    const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (key === "PAYZAPP" || key === "MOBIKWIK" || key === "FREECHARGE") continue;
      if (stripped.startsWith(key)) return MAP[key];
    }
  }
  // Unknown named merchant on a card spend → ONLINE_SHOPPING (most common
  // catch-all; cards earn their online row). Wallet loads stay eliminated:
  // known wallet keys map to WALLET, which has no action → no reward row.
  // UPI person-pays (merchant "UPI") stay null so the ledger flags them
  // "not a card spend".
  return n === "UPI" ? null : "ONLINE_SHOPPING";
}
