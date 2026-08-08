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
  return null;
}
