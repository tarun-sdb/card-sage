// Parse Indian bank SMS transaction alerts into structured transactions.
// Regex-heavy: banks vary, keep patterns broad. Returns null if not a
// card transaction alert.

// Amount variants: "Rs 1,234.00", "INR 1,234", "Rs. 1234", "₹1,234"
const AMOUNT = /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d+)?)/i;

// Card ref: "xx1234", "card ending 1234", "Visa Card 1234", "card 1234"
const CARD = /(?:xx|x|ending|card(?:s)?)[\s:]*([\d]{4})/i;

// Merchant: "at SWIGGY", "at AMAZON PAY", "to PHONEPE". Stop at date/txn words.
const MERCHANT = /(?:at|to)\s+([A-Za-z0-9][A-Za-z0-9&'.\- ]*?)(?=\s+(?:on|using|via|ref|txn|date|of|\.)\b|\bON\b|$)/i;

const SPEND_WORDS = /(?:spent|debited|charged|paid|purchase|txn|transaction|used)/i;

// Sender-ID → bank/issuer name. UPI credit lines (slice, super.money) send
// from their own ID; banks send their shortcode. Order matters: longest first.
const SENDER_BANKS = [
  [/sbiphon|sbi card|sbi /i, "SBI"],
  [/hdfc/i, "HDFC"],
  [/axis/i, "AXIS"],
  [/icici/i, "ICICI"],
  [/kotak/i, "KOTAK"],
  [/slice/i, "SLICE"],
  [/super.?money/i, "SUPERMONEY"],
  [/idfc/i, "IDFC"],
  [/jupiter/i, "JUPITER"],
  [/salaryse/i, "SALARYSE"],
];

// Body hint: "from <Bank> A/c", "from A/c XX1234", "via UPI at X". Falls back
// to sender ID when the body names no bank.
const BODY_BANK = /from\s+([A-Za-z][A-Za-z ]{2,30}?)\s+(?:A\/?c|account|card)/i;

export function parseSms(sender, body) {
  if (!body || !SPEND_WORDS.test(body)) return null;

  const amount = body.match(AMOUNT);
  const card = body.match(CARD);
  const merchant = body.match(MERCHANT);
  const bodyBank = body.match(BODY_BANK);

  if (!amount) return null;

  const senderMatch = SENDER_BANKS.find(([re]) => re.test(sender || ""));
  return {
    sender: sender || "",
    amount: parseFloat(amount[1].replace(/,/g, "")),
    cardLast4: card ? card[1] : null,
    merchant: merchant ? merchant[1].trim().toUpperCase() : null,
    bank: bodyBank ? bodyBank[1].trim().toUpperCase() : (senderMatch ? senderMatch[1] : null),
  };
}
