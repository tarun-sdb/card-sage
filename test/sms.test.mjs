import { parseSms } from '/home/tarun/card-sage/src/engine/sms.js';

const samples = [
  ["HDFCBK", "Rs 1,234.00 spent on HDFC Credit Card xx4321 at SWIGGY on 05-Aug-26. Available credit limit Rs 2,00,000.00. Txn 012345."],
  ["SBIINB", "INR 500.00 debited from SBI Card 1234 at AMAZON PAY on 04-Aug-26. UPI ref 123456789012. Not you? Call 1800111109."],
  ["AXISBK", "Rs. 2,500 spent on Axis Credit Card ending 9999 at MAKEMYTRIP.COM on 03-Aug-26."],
  ["ICICIB", "₹1,000 paid to PHONEPE using ICICI Bank Credit Card xx7788 on 02-Aug-26."],
  ["HDFCBK", "Rs 3,000.00 credited to your HDFC Bank Account. Ref 987654."],
  ["SBIINB", "Your OTP for SBI Card is 123456. Valid for 10 mins."],
  ["PROMO", "Special offer: 50% off on Zomato with HDFC cards. Apply now!"],
  ["SLICE", "₹1,234.00 debited from Slice A/c 9876 via UPI at AMAZON"],
  ["SBIPHONEPE", "Rs.450 debited from SBI Card A/c XX2345 via UPI at ZOMATO"],
  ["HDFCBK", "Rs.500 debited from A/c XX1234 via UPI at PAYTM on 05-Aug-26"],
  ["VPAY", "UPI Ref 999: Rs 2,500 debited from HDFC Bank A/c 1234 at BLINKIT"],
];

let fail = 0;
for (const [s, b] of samples) {
  const r = parseSms(s, b);
  console.log(r ? `OK   ${b.slice(0, 45)}... -> ${JSON.stringify({ amount: r.amount, card: r.cardLast4, merchant: r.merchant, bank: r.bank, credit: r.isCredit })}` : `SKIP ${b.slice(0, 45)}...`);
  if (r && r.amount <= 0) fail++;
}
// expect: 8 parsed (4 old + 4 UPI), 3 skipped (credit, otp, promo)
const parsed = samples.filter(([s,b]) => parseSms(s,b)).length;
if (parsed !== 8) { console.log('FAIL: expected 8 parsed, got', parsed); fail++; }
// UPI bank extraction: SLICE -> SLICE, SBIPHONEPE -> SBI, HDFCBK -> HDFC,
// VPAY body "from HDFC Bank A/c" -> HDFC BANK
const banks = ["SLICE", "SBI", "HDFC", "HDFC BANK"];
const got = samples.filter(([s, b]) => parseSms(s, b)).slice(4).map(([s, b]) => parseSms(s, b).bank);
if (JSON.stringify(got) !== JSON.stringify(banks)) { console.log('FAIL: bank mismatch', got); fail++; }
process.exit(fail ? 1 : 0);
