// Portal actions: common India purchases. Each action maps to a dataset
// reward category + redirect targets (apps) with convenience-fee data.
// Fee = card payment fee charged BY the app (not bank). -1 = unavailable/unknown.

export const ACTIONS = [
  {
    id: "upi",
    label: "UPI payments",
    category: "UPI",
    icon: "📲",
    note: "Only RuPay cards with UPI-cashback reward rows apply; most cards earn 0 on UPI person payments.",
    merchantKeywords: ["upi"],
    apps: [
      { id: "upi", label: "UPI app", feePct: 0, url: null },
    ],
  },
  {
    id: "mobile-recharge",
    label: "Mobile recharge",
    category: "UTILITY_BILLS",
    icon: "📱",
    apps: [
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com/recharge" },
      { id: "amazon-pay", label: "Amazon Pay", feePct: 0, url: "https://www.amazon.in/mobile-recharge" },
      { id: "paytm", label: "Paytm", feePct: 0, url: "https://paytm.com/recharge" },
      { id: "jio", label: "Jio app", feePct: 0, url: "https://www.jio.com/selfcare/recharge" },
    ],
  },
  {
    id: "electricity-bill",
    label: "Electricity bill",
    category: "UTILITY_BILLS",
    icon: "💡",
    apps: [
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com/electricity" },
      { id: "paytm", label: "Paytm", feePct: 0, url: "https://paytm.com/electricity-bill-payment" },
      { id: "amazon-pay", label: "Amazon Pay", feePct: 0, url: "https://www.amazon.in/pay/bbps" },
    ],
  },
  {
    id: "dth-recharge",
    label: "DTH recharge",
    category: "UTILITY_BILLS",
    icon: "📺",
    apps: [
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com/dth" },
      { id: "paytm", label: "Paytm", feePct: 0, url: "https://paytm.com/dth-recharge" },
    ],
  },
  {
    id: "gas-cylinder",
    label: "LPG cylinder",
    category: "UTILITY_BILLS",
    icon: "🔥",
    apps: [
      { id: "paytm", label: "Paytm", feePct: 0, url: "https://paytm.com/gas-cylinder-booking" },
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com/lpg" },
    ],
  },
  {
    id: "insurance",
    label: "Insurance premium",
    category: "INSURANCE",
    icon: "🛡️",
    apps: [
      { id: "policybazaar", label: "Policybazaar", feePct: 0, url: "https://www.policybazaar.com" },
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com/insurance" },
    ],
  },
  {
    id: "credit-card-bill",
    label: "Credit card bill",
    category: null, // special: no reward category, fee logic matters
    icon: "💳",
    note: "Many cards charge 1% fee on CC bill via third-party apps. Prefer bank app (0%).",
    apps: [
      { id: "bank-app", label: "Bank app / netbanking", feePct: 0, url: "https://www.google.com/search?q=pay+credit+card+bill+netbanking", recommend: "skip-card" },
      { id: "cred", label: "CRED", feePct: 1, url: "https://cred.club", warn: "1% fee wipes most rewards" },
      { id: "paytm", label: "Paytm", feePct: 1, url: "https://paytm.com/credit-card-bill-payment", warn: "1% fee wipes most rewards" },
    ],
  },
  {
    id: "fastag",
    label: "FASTag recharge",
    category: "UTILITY_BILLS",
    icon: "🛣️",
    apps: [
      { id: "paytm", label: "Paytm FASTag", feePct: 0, url: "https://paytm.com/fastag" },
      { id: "amazon-pay", label: "Amazon Pay", feePct: 0, url: "https://www.amazon.in/fastag" },
    ],
  },
  {
    id: "fuel",
    label: "Fuel (petrol/diesel)",
    category: "FUEL",
    icon: "⛽",
    note: "Most cards exclude fuel or cap rewards. Some give surcharge waiver.",
    // Brand-scoped reward rows (HPCL, IOCL, BPCL) match these keywords.
    merchantKeywords: ["hpcl", "hindustan petroleum", "iocl", "indian oil", "bpcl", "bharat petroleum"],
    apps: [
      { id: "pump", label: "At pump (swipe)", feePct: 0, url: null },
      { id: "hp-pay", label: "HP Pay app", feePct: 0, url: "https://www.hpcl.in/hp-pay" },
    ],
  },
  {
    id: "ott",
    label: "OTT subscriptions",
    category: "OTT_SUBSCRIPTIONS",
    icon: "🎬",
    apps: [
      { id: "netflix", label: "Netflix", feePct: 0, url: "https://www.netflix.com" },
      { id: "prime", label: "Amazon Prime", feePct: 0, url: "https://www.primevideo.com" },
      { id: "hotstar", label: "Hotstar", feePct: 0, url: "https://www.hotstar.com" },
    ],
  },
  {
    id: "grocery",
    label: "Groceries",
    category: "GROCERY",
    icon: "🛒",
    apps: [
      { id: "bigbasket", label: "BigBasket", feePct: 0, url: "https://www.bigbasket.com" },
      { id: "blinkit", label: "Blinkit", feePct: 0, url: "https://blinkit.com" },
      { id: "dmart", label: "DMart Ready", feePct: 0, url: "https://www.dmartready.com" },
    ],
  },
  {
    id: "online-shopping",
    label: "Online shopping",
    category: "ONLINE_SHOPPING",
    icon: "🛍️",
    apps: [
      { id: "amazon", label: "Amazon", feePct: 0, url: "https://www.amazon.in" },
      { id: "flipkart", label: "Flipkart", feePct: 0, url: "https://www.flipkart.com" },
      { id: "myntra", label: "Myntra", feePct: 0, url: "https://www.myntra.com" },
    ],
  },
  {
    id: "dining",
    label: "Dining / food delivery",
    category: "DINING",
    icon: "🍽️",
    apps: [
      { id: "swiggy", label: "Swiggy", feePct: 0, url: "https://www.swiggy.com" },
      { id: "zomato", label: "Zomato", feePct: 0, url: "https://www.zomato.com" },
      { id: "dineout", label: "Dineout", feePct: 0, url: "https://www.dineout.co.in" },
    ],
  },
  {
    id: "travel",
    label: "Travel (flights/hotels)",
    category: "TRAVEL",
    icon: "✈️",
    apps: [
      { id: "mmt", label: "MakeMyTrip", feePct: 0, url: "https://www.makemytrip.com" },
      { id: "phonepe", label: "PhonePe Travel", feePct: 0, url: "https://www.phonepe.com/travel" },
      { id: "goibibo", label: "Goibibo", feePct: 0, url: "https://www.goibibo.com" },
    ],
  },
  {
    id: "education",
    label: "Education (courses/fees)",
    category: "EDUCATION",
    icon: "🎓",
    apps: [
      { id: "phonepe", label: "PhonePe", feePct: 0, url: "https://www.phonepe.com" },
      { id: "paytm", label: "Paytm", feePct: 0, url: "https://paytm.com" },
      { id: "amazon-pay", label: "Amazon Pay", feePct: 0, url: "https://www.amazon.in/pay" },
    ],
  },
  {
    id: "rent",
    label: "Rent",
    category: "RENT",
    icon: "🏠",
    note: "Most cards exclude rent or charge 1% fee. Usually better via UPI/bank transfer.",
    apps: [
      { id: "upi", label: "UPI / bank transfer", feePct: 0, url: null, recommend: "skip-card" },
      { id: "paytm", label: "Paytm Rent", feePct: 1, url: "https://paytm.com/rent-payment", warn: "1% fee" },
    ],
  },
];
