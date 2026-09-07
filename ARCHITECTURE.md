# CardSage Architecture & Decision Cheatsheet

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CARD SAGE APP                            │
│  React Native (Expo SDK 57) • TypeScript • Hermes              │
├─────────────────────────────────────────────────────────────────┤
│  UI Layer (App.js)                                              │
│  ├─ Tabs: Spends / Cards / Insights / Settings                 │
│  ├─ Logo: gradient ₹ tile + wordmark (MARK_SAGE→MARK_PINE)     │
│  ├─ RecommendationEngine: per-transaction best-card            │
│  ├─ CapCountdown: monthly limit + days-left                    │
│  └─ TeachOnUnmatched: "WHICH CARD?" sheet                      │
├─────────────────────────────────────────────────────────────────┤
│  Engine (src/engine/)                                           │
│  ├─ recommend.ts   — rule-based per-tx best card               │
│  ├─ sms.ts         — regex + NLP merchant normalization         │
│  ├─ merchants.ts   — 400+ known merchant → category map        │
│  └─ actions.ts     — category→icon/color/label mapping         │
├─────────────────────────────────────────────────────────────────┤
│  Native Modules (Expo Modules API)                             │
│  ├─ sms-reader (Kotlin) — 30-day SMS window, ABI getter        │
│  └─ share-receiver      — ACTION_SEND text receiver             │
├─────────────────────────────────────────────────────────────────┤
│  Persistence (AsyncStorage)                                     │
│  ├─ wallet (user's cards)                                       │
│  ├─ learnt (merchant→card corrections)                         │
│  ├─ txns (cached SMS txns)                                      │
│  └─ settings (theme, caps, prefs)                               │
├─────────────────────────────────────────────────────────────────┤
│  Updater (JS)                                                   │
│  └─ GitHub Releases API → per-ABI APK (arm64/v7a/x86/x64)      │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Choices & Rationale

| Layer | Choice | Why This | Why Not Alternative |
|-------|--------|----------|---------------------|
| **Framework** | Expo SDK 57 (React Native 0.76) | Managed workflow, OTA updates, native modules via Expo Modules API, single codebase | Bare RN = manual native linking, more config drift; Flutter = Dart not TS, larger bundle |
| **Language** | TypeScript (strict) | Type safety across engine + UI, catches regressions | Plain JS = runtime errors in engine logic; Flow = dead |
| **Runtime** | Hermes | Small bundle, fast startup, AOT on Android | JSC = larger, slower cold start; V8 = not supported on RN Android |
| **Navigation** | React Navigation v6 (bottom tabs) | Standard, performant, TypeScript-first | Expo Router = file-based, overkill for 4 tabs; Wix = deprecated |
| **State** | React `useState`/`useReducer` + AsyncStorage | Simple, no external deps, persists across restarts | Redux/MobX/Recoil = overkill for 4 screens; Context = fine but verbose |
| **Native Bridge** | Expo Modules API (Kotlin/Swift) | Type-safe, auto-linking, works in managed Expo | `react-native-bridge` = deprecated, manual `Podfile`/`build.gradle` edits |
| **SMS Reading** | Custom `sms-reader` Kotlin module | 30-day window filter, `getAbi()` for per-ABI updates, no `READ_SMS` in foreground | Expo `expo-sms` = deprecated, no window filter; `react-native-get-sms` = unmaintained |
| **Build** | `eas build` (CI) + local `build-apk.bat` | CI = reproducible, per-ABI splits; local = fast iteration | `gradle assemble` only = no ABI splits, no OTA; `fastlane` = extra config |
| **Distribution** | GitHub Releases + in-app updater | Free, per-ABI (26MB vs 68MB), ABI-aware URL | Play Store = review delay, no sideload for test device; Expo Updates = paid tiers |
| **Icons** | SVG → PNG (local rasterizer) | Font-accurate `₹` (DejaVu Bold U+20B9), 85%, rounded square, vignette | `expo-icon` = low-res; AI generators = hallucinate `₹` as `A`/`F`/`Rs`; manual PNG = drift |
| **Persistence** | AsyncStorage (key-value) | Zero config, survives uninstall/reinstall (almost), syncs via backup | SQLite/Realm = overkill for <100KB; MMKV = native module not in Expo |
| **Styling** | `StyleSheet.create` + theme object | Colocated, typed, dark/light via `useColorScheme` | Styled Components = bundle size; Tailwind = not RN-native; CSS = no |

## App Flow (User Journey)

```
LAUNCH
  │
  ├─ Updater.checkUpdate() → GitHub Releases (per-ABI URL)
  │     └─ if newer → download 26MB arm64 APK → install → restart
  │
  ├─ Load wallet + learnt + settings from AsyncStorage
  │
  ├─ SMS Reader (background, 30-day window)
  │     └─ onTxn → normalize merchant → categorize → recommend best card
  │
  ├─ TABS
  │    ├─ SPENDS: list + monthly cap countdown + per-tx recommendation
  │    ├─ CARDS:  wallet editor + teach-on-unmatched ("WHICH CARD?")
  │    ├─ INSIGHTS: top-earner (owned only), per-card monthly cashback
  │    └─ SETTINGS: caps, theme, teach mode, export/import
  │
  └─ SHARE RECEIVER (ACTION_SEND) → parse pasted SMS → add txn
```

## Engine Rules (Decision Logic)

### Recommendation (`recommend.ts`)
```
for each txn:
  1. match merchant → category (merchants.ts: 400+ exact/fuzzy)
  2. filter user's wallet cards for that category
  3. score each card:
       base cashback × (1 if category matches else 0)
       + bonus if txn > card's quarterly cap threshold
       - penalty if card's monthly cap near exhausted
  4. return top card + reason string
  5. if no match → "Teach" sheet → user picks → save to learnt
```

### Merchant Normalization (`sms.ts`)
```
raw SMS → regex extract (amount, last4, merchant, date)
  → clean merchant: lowercase, remove suffixes (*PURCHASE, *ONLINE)
  → fuzzy match: levenshtein against 400+ known merchants
  → fallback: category from keywords (fuel/food/travel/grocery)
```

### Cap Countdown
```
monthlyCap - spentThisMonth → ₹ remaining
daysInMonth - dayOfMonth → days left
label: "₹{remaining} to cap • {days}d left"
```

## Updater Architecture (Per-ABI, ABI-Aware)

```
GitHub Releases (v1.0.10)
  ├─ app-arm64-v8a-release.apk      (26 MB)
  ├─ app-armeabi-v7a-release.apk    (21 MB)
  ├─ app-x86-release.apk            (27 MB)
  └─ app-x86_64-release.apk         (27 MB)
                    ▲
                    │ HTTPS
                    │
        ┌───────────┴───────────┐
        │  Updater.checkUpdate()│
        │  1. fetch latest tag  │
        │  2. getAbi() → "arm64-v8a"               │
        │  3. construct URL:                    │
        │     https://github.com/.../releases/   │
        │     latest/download/app-{abi}-release.apk
        │  4. if version > current → download    │
        │  5. Intent.ACTION_INSTALL_PACKAGE      │
        └────────────────────────────────────────┘
```

**Why per-ABI:** 68MB universal → 26MB arm64 (95% of devices). Saves bandwidth, installs faster, Play-ready.
**Why ABI-aware URL:** v1.0.7 universal `app-release.apk` gone in v1.0.8+; old updater would 404. `getAbi()` added in Kotlin module.

## Icon Pipeline

```
SVG (design/icon.svg)
  │  DejaVu Sans Bold ₹, font-size 753 (85%), stroke 12, rounded rx=180
  │  Gradient #93BE9B→#2E5138 diagonal, radial vignette 0.12
  ▼
PNG Rasterizer (pure Python, zlib only)
  ├─ icon.png          1024² RGBA  ← legacy (legacy launchers)
  ├─ android-icon-background.png   512² RGB   ← opaque gradient+vignette
  ├─ android-icon-foreground.png   512² RGBA  ← white ₹ 85% transparent
  └─ android-icon-monochrome.png   1024² RGBA ← white ₹ 85% transparent
       │
       ▼
app.json adaptiveIcon
  ├─ backgroundImage: android-icon-background.png  (opaque, overrides color)
  ├─ foregroundImage: android-icon-foreground.png  (white ₹)
  ├─ monochromeImage: android-icon-monochrome.png
  └─ backgroundColor: #E6F4FE  (fallback)
       │
       ▼
expo prebuild → android/res/mipmap-*/ic_launcher*.webp
       │
       ▼
gradle assembleRelease → per-ABI APKs with adaptive icon
```

**Why this pipeline:**
- **SVG source** = single source of truth, font-accurate `₹` (no AI hallucination)
- **TrueType rasterizer** failed on fragmented `₹` contours → geometric fallback (bold, clean, 85%)
- **Rounded square (`rx 180`)** = iOS-style, Android adaptive clips to circle anyway
- **Vignette (0.12)** = depth on light walls, keeps center bright
- **85% scale** = fills safe zone (66% circle), max impact without clipping
- **2px stroke (`stroke-width 12`)** = `B` = rounder/bolder, survives 48dp downscale
- **Vignette + diagonal** = brand (`MARK_SAGE→MARK_PINE`) + depth on light walls

**Why not:**
- `expo-icon` = auto-crop, no `₹` control, low-res
- `expo-splash` = splash only, not launcher
- AI generators (Midjourney/DALL-E) = `₹` → `A`/`F`/`Rs` 90% of time
- Manual PNG in Figma = drift, no version control, no font accuracy

## Build Commands Cheatsheet

```bash
# Local Android (Windows host, WSL cross-compile)
cd /mnt/c/Users/tarun/card-sage-win
cmd /c build-apk.bat          # → app-arm64-v8a-release.apk (26MB)

# CI (GitHub Actions)
git tag v1.0.10 && git push origin v1.0.10
# → .github/workflows/android-build.yml → per-ABI APKs → GitHub Release

# Expo prebuild (regenerate android/ from app.json + plugins)
cd apps/mobile && npx expo prebuild --platform android --no-install

# Sync assets win ← repo (CRLF)
sed 's/$/\r/' repo/assets/icon.png > win/assets/icon.png

# Install to test device
adb install -r path/to/app-arm64-v8a-release.apk

# Logs
adb logcat -s CardSage:V *:S

# Uninstall clean
adb uninstall in.cardsage.app
```

## Common Pitfalls & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Expo icon in launcher | `backgroundImage` transparent PNG overrides `backgroundColor` | Remove transparent `backgroundImage` or make it opaque |
| Updater 404 on v1.0.8+ | Universal `app-release.apk` removed, per-ABI only | `getAbi()` in Kotlin → `app-{abi}-release.apk` |
| Icon clipped at top | `dominant-baseline` not `central` + wrong scale | `dominant-baseline="central"` + scale ≤85% |
| Expo default icon | `backgroundImage` transparent → blank adaptive icon | Use opaque gradient PNG or `backgroundColor` only |
| Updater 404 on old installs | v1.0.7 had universal APK, v1.0.8+ doesn't | Sideload arm64 once, then ABI-aware works |
| Device offline | USB cable / auth timeout | `adb kill-server && adb start-server`, replug cable |
| Gradle UP-TO-DATE but no APK | Incremental cache | `gradlew clean assembleRelease` or `build-apk.bat` cleans bundle |
| `local.properties` missing | `expo prebuild` wipes it | Re-write `sdk.dir=C\:\\Users\\tarun\\AppData\\Local\\Android\\Sdk` |

## Versioning & Release

```
version (app.json)    versionCode (build.gradle)    Git tag
1.0.8                 10                            v1.0.8
1.0.9                 11                            v1.0.9
1.0.10                12                            v1.0.10  ← current
```

**Rule:** bump both `version` + `versionCode` together in `app.json` AND `build.gradle` before `expo prebuild`. `prebuild` bakes `versionCode` into `build.gradle`.

## Secrets & Config

| Secret | Location | Purpose |
|--------|----------|---------|
| `GH_TOKEN` | GitHub Actions secret | `gh release upload` in CI |
| `ANDROID_KEYSTORE` | `~/.android/debug.keystore` | Debug signing (local) / Release keystore (CI) |
| `EXPO_TOKEN` | Not used | Using GitHub Releases, not Expo Updates |

## Summary for Next Contributor

1. **Start here:** `apps/mobile/App.js` → engine imports → native modules
2. **Icon changes:** Edit `design/icon.svg` → rasterize → copy 4 PNGs → `prebuild` → build
3. **Engine changes:** `src/engine/` → pure TS, no native deps → test with `npm test`
3. **Native changes:** `modules/sms-reader/` (Kotlin) / `modules/share-receiver/` → `expo prebuild`
4. **Release:** `git tag vX.Y.Z && git push origin vX.Y.Z` → CI auto-publishes
5. **Sideload test:** `adb install -r .../app-arm64-v8a-release.apk`

**Philosophy:** Minimal deps, font-accurate brand, per-ABI delivery, single-source SVG, readable TS, no over-engineering.