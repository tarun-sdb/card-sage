# Card Sage

Card Sage is an Android app that reads the SMS alerts your bank sends after a purchase and tells you which card in your wallet you should have used. Every bank message gets matched to a card by the last four digits, the transaction is bucketed into a category (groceries, fuel, online shopping), and the app ranks your cards by net cashback for that category, with the monthly cap already subtracted.

One real example: a ₹939 TATA 1MG order via HDFC Bank Millennia earned 2.5% cashback (₹213 for the month so far), where most other cards in the wallet would have earned 1% or nothing. That math is what the app does for every transaction, in about a second.

I built this because I kept losing track of which card paid for what. The app is a personal project, currently installed on my phone, updated roughly monthly.

## What it does

- Scans bank SMS (HDFC, ICICI, and any format it can parse) and turns each alert into a ledger row with merchant, amount, card used, and date
- Recommends the best card for a category before you pay, from the app's portal screen, with the fee each payment app charges already factored in
- Tracks monthly cashback caps per card, per category, so a recommendation accounts for how much of the cap you've already spent
- Dark and light themes, category filter chips, and a share-sheet entry point: send a payment confirmation to the app from any other app
- Shows the last four digits of the card on each transaction so you know what you actually paid with

## Privacy

The SMS parsing happens entirely on the phone. Message text never leaves the device; there is no account, no server, no analytics SDK. The source is open, so the claim is checkable.

## Install

Grab the latest `app-release.apk` from [Releases](https://github.com/tarun-sdb/card-sage/releases). The app is not on the Play Store, so Google Play Protect will show a warning on install because it does not recognize the signing key. Tap through it or install over ADB:

```sh
adb install -r app-release.apk
```

The app only needs SMS read permission, which it requests on first scan. On Android 15+ that permission can be revoked automatically for non-default SMS apps after 90 days; re-granting it from Settings is enough to restore scanning.

## For developers

The layout is deliberately boring. The recommendation logic, SMS parser, and merchant mapping live in `src/engine` as pure JavaScript with no React imports, so they run under `node --test` without a device.

```
apps/mobile   Expo SDK 57 / React Native app (single App.js)
src/engine    pure JS: recommendation, SMS parsing, merchant mapping
src/data      cards.json, the card reward dataset
test/         node --test suites against the engine
```

Card reward data comes from the public CardAdvisor dataset, trimmed to cards that exist in India.

### Run it

```sh
cd apps/mobile
npm ci
npx expo prebuild --platform android
cd android
./gradlew assembleRelease        # gradlew.bat on Windows
adb install app/build/outputs/apk/release/app-release.apk
```

Engine tests:

```sh
node --test test/
```

### Release process

A release is a git tag. Pushing `vX.Y.Z` triggers the workflow in `.github/workflows/android-build.yml`, which generates the Android project, signs the APK, and attaches it to a GitHub Release. Bump the version in `apps/mobile/app.json` and `CUR_VERSION` in `apps/mobile/modules/updater.js` first; the app checks the latest release on launch and offers the update in a banner.

```sh
git tag v1.0.2 && git push origin v1.0.2
```

The signing key is stored as a GitHub secret, so CI builds install over locally built ones without uninstalling first.

## Contributing

Open an issue if the SMS parser mangles a bank's format or a recommendation looks wrong; both are data problems and small fixes. Pull requests are welcome, with the condition that `node --test test/` stays green. Keep the engine free of React imports so it stays testable.

MIT
