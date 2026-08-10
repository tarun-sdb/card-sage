# CardSage TODO

## Done
- [x] Share-sheet intake: Android share → merchant detect → best-card pick modal
- [x] Web portal + portal cards (src/App.jsx)
- [x] SMS scan (manual button + auto-scan on open), last4 card matching
- [x] Nightly scan persistence (AsyncStorage ledger + sms-marker dedupe)
- [x] UPI bank detection: bank parsed from SMS sender/body, bank→card map
- [x] UPI rewards: RuPay cards earn DEFAULT row on UPI (slice 1% no cap,
      SBI PhonePe 1% cap ₹2000), cap tracked per card+row
- [x] Portal crash: openPicker not threaded to PortalsPage → ReferenceError
      on portal tap (regression 825a6eb)
- [x] Portal best-card: removed hardcoded ₹500 min-txn filter that wrongly
      excluded top picks for big-ticket actions (flights etc.)

## Remaining
- [ ] Build + install new APK on phone (current: card-sage-last4.apk, pre-UPI)
- [ ] UPI bank in SMS but no matching wallet card → hint "add this card"
- [ ] Sender-ID map gaps: JUPITER/IDFC/KOTAK UPI SMS formats unverified live
- [ ] Cap-exhausted card still shown as top pick — show "cap done" instead
- [ ] Tie-break: same-rate cards pick by CASHBACK type, not wallet order
      (engine.test.mjs: recharge@paytm, online@amazon pre-existing fails)
- [ ] Nightly scan: refresh home list when app resumes (stale-data sync)
