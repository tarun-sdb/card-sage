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
const CREDIT_WORDS = /(?:credited|received|refund|added)/i;

export function parseSms(sender, body) {
  if (!body || !SPEND_WORDS.test(body)) return null;
  if (CREDIT_WORDS.test(body) && !SPEND_WORDS.test(body)) return null;

  const amount = body.match(AMOUNT);
  const card = body.match(CARD);
  const merchant = body.match(MERCHANT);
  const isCredit = CREDIT_WORDS.test(body);

  if (!amount) return null;

  return {
    sender: sender || "",
    amount: parseFloat(amount[1].replace(/,/g, "")),
    cardLast4: card ? card[1] : null,
    merchant: merchant ? merchant[1].trim().toUpperCase() : null,
    isCredit,
    raw: body,
  };
}
