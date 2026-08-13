// Parse Indian bank SMS transaction alerts into structured transactions.
// Regex-heavy: banks vary, keep patterns broad. Returns null if not a
// card transaction alert.

// Amount variants: "Rs 1,234.00", "INR 1,234", "Rs. 1234", "₹1,234"
const AMOUNT = /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d+)?)/i;

// Card ref: "xx1234", "card ending 1234", "Visa Card 1234", "card 1234"
const CARD = /(?:xx|x|ending|card(?:s)?)[\s:]*([\d]{4})/i;

// Merchant: "at SWIGGY", "at AMAZON PAY", "to PHONEPE", "for Airtel
// recharge". `*` = payment gateways ("at RAZ*Smytten"). Stop at date/txn
// words — otherwise a bank footer ("...SMS BLOCK to 7308080808") becomes
// the merchant instead of the gateway that precedes the date.
const MERCHANT = /(?:at|to|for)\s+([A-Za-z0-9][A-Za-z0-9&'.\-* ]*?)(?=\s+(?:on|using|via|ref|txn|date|of|\.)\b|\bON\b|$)/i;

// VPA (UPI id): "to 9876543210@ybl", "from name@okhdfcbank" — a person-pay.
const UPI_ID = /(?:to|from)\s+[a-zA-Z0-9._-]+@[a-zA-Z]{2,}/i;

// Recharge alerts rarely name a merchant ("Rs.249 recharged for 98xxxx").
const RECHARGE = /(?:recharge|recharged|top[- ]?up)/i;

const SPEND_WORDS = /(?:spent|debited|charged|paid|purchase|txn|transaction|used|recharg)/i;

// Money-in alerts (credited/received/deposited/refunds) — the ledger shows
// card spends only. Credit bodies often still contain "txn", so this check
// runs after SPEND_WORDS and drops them.
const CREDIT_WORDS = /(?:credited|received|deposited|refund|reversal|added to|transferred from|credit note|paid to you|credit(?!\s*(?:card|limit)))/i;

// Failed/declined alerts: amount + "txn" present, but no money moved.
const DECLINE_WORDS = /(?:declined|failed|unsuccessful|not completed|rejected|insufficient|wasted)/i;

// OTP/verification alerts: "OTP for txn of Rs.X" looks like a spend but no
// money moved. Skip before SPEND_WORDS can claim them.
const OTP_WORDS = /otp|one[- ]?time password/i;

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
  if (!body || OTP_WORDS.test(body)) return null;
  if (!SPEND_WORDS.test(body)) return null;
  if (CREDIT_WORDS.test(body)) return null; // money-in: not a spend
  if (DECLINE_WORDS.test(body)) return null; // rejected txn: no money moved

const amount = body.match(AMOUNT);
  const card = body.match(CARD);
  const merchant = body.match(MERCHANT);
  const bodyBank = body.match(BODY_BANK);
  const senderMatch = SENDER_BANKS.find(([re]) => re.test(sender || ""));

  if (!amount) return null;

  // Recharge/SMS duplicates: bank AND operator (Airtel/Jio/VI) both alert.
  // Keep only the bank's — operator sender-IDs are not in SENDER_BANKS.
  if (RECHARGE.test(body) && !senderMatch) return null;

  const rawMerchant = merchant ? merchant[1].trim().toUpperCase() : null;

  return {
    sender: sender || "",
    amount: parseFloat(amount[1].replace(/,/g, "")),
    cardLast4: card ? card[1] : null,
    // UPI person-pay, then recharge alerts, then merchant, then phone-number
    // pays ("to 9876543210") which are UPI too.
    merchant: UPI_ID.test(body)
      ? "UPI"
      : RECHARGE.test(body)
        ? "RECHARGE"
        : rawMerchant && /^\d{6,}/.test(rawMerchant)
          ? "UPI"
          : rawMerchant,
    bank: bodyBank ? bodyBank[1].trim().toUpperCase() : (senderMatch ? senderMatch[1] : null),
  };
}
