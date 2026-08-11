import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, FlatList, Linking, Modal, PanResponder, PermissionsAndroid, Platform,
  Pressable, RefreshControl, SectionList, Share, StyleSheet, Text, TextInput, useColorScheme,
  Vibration, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import cardsData from '../../src/data/cards.json';
import { ACTIONS } from '../../src/engine/actions';
import { recommend, rewardFor, spentKey } from '../../src/engine/recommend';
import { parseSms } from '../../src/engine/sms';
import { merchantCategory } from '../../src/engine/merchants';
import SmsReader from './modules/sms-reader';
import { loadTxns, registerNightlyScan } from './modules/nightly-scan';
import ShareReceiver from './modules/share-receiver';

// Unmapped merchants (UPI person payments etc.) route through the UPI action.
const UPI_ACTION = ACTIONS.find((a) => a.id === 'upi');
const WALLET_KEY = 'card-sage:wallet';
const THEME_KEY = 'card-sage:theme';

// Effective theme, shared with leaf components (useStyles below). App
// resolves system/default/dark/light and provides it; null = not loaded yet.
const ThemeContext = createContext(null);
const THEME_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

// Caps reset monthly — only this month's txns deplete a cap.
const isCurrentMonth = (d) => {
  const x = new Date(d);
  const n = new Date();
  return !isNaN(x.getTime()) && x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth();
};

// "YYYY-MM" bucket for per-month cap pools ("2026-07", "2026-08").
const monthKey = (d) => {
  const x = new Date(d);
  if (isNaN(x.getTime())) return 'Unknown';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

// "The Ledger" — color encodes meaning only. earn = winning, warn = min not
// met / near cap, danger = over cap, muted = unknowable (UPI person pays).
const palettes = {
  light: {
    bg: '#F7F8FA', surface: '#FFFFFF', hairline: '#E5E8EC',
    text: '#12161C', sub: '#5B6470', amount: '#0E1116',
    earn: '#16A34A', warn: '#D97706', danger: '#DC2626', muted: '#8A919C',
    meterTrack: '#E5E8EC',
  },
  dark: {
    bg: '#0E1116', surface: '#161B22', hairline: '#242B33',
    text: '#EDF0F4', sub: '#9AA4B2', amount: '#FFFFFF',
    earn: '#22C55E', warn: '#F59E0B', danger: '#EF4444', muted: '#6B7280',
    meterTrack: '#242B33',
  },
};

// Theme-aware stylesheet hook. Leaf components render before App's scope
// resolves, so they build their own styles instead of reaching for `styles`.
// The theme override (first-run choice) flows through ThemeContext.
const useStyles = () => {
  const sysScheme = useColorScheme();
  const override = useContext(ThemeContext);
  const scheme = override || sysScheme;
  const c = palettes[scheme === 'dark' ? 'dark' : 'light'];
  return { c, styles: useMemo(() => makeStyles(c), [c]) };
};

// --- Craft components -----------------------------------------------------

// Wallet fan: two rotated cards peeking behind the front card. Front holds
// the real content (potential summary / empty state).
function Fan({ c, front }) {
  const { styles } = useStyles();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1, duration: 500, delay: 100, easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  const anim = {
    opacity: rise,
    translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
  };
  return (
    <View style={styles.fan}>
      <Animated.View
        style={{
          opacity: anim.opacity,
          transform: [{ translateY: anim.translateY }, { rotate: '-5deg' }, { translateX: -10 }],
          ...styles.fanCard,
        }}
      />
      <Animated.View
        style={{
          opacity: anim.opacity,
          transform: [{ translateY: anim.translateY }, { rotate: '6deg' }, { translateX: 10 }],
          ...styles.fanCard,
        }}
      />
      <LinearGradient
        colors={[c.surface, c.earn + '14']}
        style={[styles.fanCard, styles.fanFront]}
      >
        {front}
      </LinearGradient>
    </View>
  );
}

function CountUp({ value, style }) {
  const [disp, setDisp] = useState('0');
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = anim.addListener(({ value: v }) => setDisp(String(Math.round(v))));
    Animated.timing(anim, {
      toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => anim.removeListener(l);
  }, [value]);
  return <Text style={style}>₹{Number(disp).toLocaleString('en-IN')}</Text>;
}

function CapMeter({ used, cap, c, label }) {
  const { styles } = useStyles();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Fill climbs 0 → pct on mount; per-row meters rise to different
    // amounts, which reads as cashback accumulating transaction by txn.
    Animated.timing(a, {
      toValue: 1, duration: 700, delay: 200, easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width + color can't use the native driver
    }).start();
  }, []);
  const pct = Math.min(1, used / cap);
  // Ramp red → amber → green as cashback accumulates; the bar literally
  // gets greener the fuller it is. Interpolate from red up to THIS meter's
  // level color — each row animates red → its own shade.
  const lerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const ramp = (p) => {
    const red = [220, 38, 38], amber = [245, 158, 11], green = [22, 163, 74];
    const rgb = p <= 0.7 ? lerp(red, amber, p / 0.7) : lerp(amber, green, (p - 0.7) / 0.3);
    return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const color = a.interpolate({
    inputRange: [0, 1],
    outputRange: ['#DC2626', ramp(pct)],
  });
  const full = pct >= 1;
  // Overcharge: when the pool is spent, a white droplet drips off the brim.
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!full) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drop, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(drop, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [full]);
  return (
    <View style={styles.meterWrap}>
      <View style={[styles.meterTrack, { backgroundColor: c.meterTrack }]}>
        <Animated.View
          style={[
            styles.meterFill,
            { backgroundColor: color },
            { width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct * 100}%`] }) },
          ]}
        />
      </View>
      {full ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.meterDrop,
            {
              left: `${Math.max(4, pct * 100 - 2)}%`,
              opacity: drop,
              transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }],
            },
          ]}
        />
      ) : null}
      {label ? <Text style={styles.meterLabel}>{label}</Text> : null}
    </View>
  );
}

// Verdict pill — tinted bg + colored text. Color carries meaning.
function Chip({ color, children, onPress }) {
  const { styles } = useStyles();
  const inner = (
    <View style={[styles.chip, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>{children}</Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={6}>{inner}</Pressable>
  ) : inner;
}

function Btn({ title, color, onPress, primary, small }) {
  const { styles } = useStyles();
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: s }] }}>
      <Pressable
        onPressIn={() => Animated.spring(s, { toValue: 0.96, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true }).start()}
        onPress={onPress}
      >
        <View
          style={[
            styles.btn, small && styles.btnSmall,
            primary
              ? { backgroundColor: color }
              : { borderWidth: 1, borderColor: color, backgroundColor: 'transparent' },
          ]}
        >
          <Text
            style={[
              styles.btnText, small && styles.btnTextSmall,
              { color: primary ? '#FFFFFF' : color },
            ]}
          >
            {title}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Swipe-left to reveal delete. Zone 1: red well, trash icon fades in
// with drag. Zone 2 (overscroll past SWIPE_KILL): well deepens to dark red,
// icon whitens + scales, release = delete. Colors need the JS driver (only
// this card, few rows, negligible cost).
const SWIPE_REVEAL = 96;   // snap-open position (zone 1)
const SWIPE_KILL = 140;    // release past here = delete (zone 2)
const SWIPE_HARD = 160;    // drag ceiling
function SwipeCard({ c, styles, children, onRemove }) {
  const x = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const redRef = useRef(false); // zone-2 vibration: once per entry
  const pos = (g) =>
    Math.max(-SWIPE_HARD, Math.min(0, g.dx + (openRef.current ? -SWIPE_REVEAL : 0)));
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const p = pos(g);
        x.setValue(p);
        if (p < -SWIPE_KILL && !redRef.current) {
          redRef.current = true;
          Vibration.vibrate(10);
        } else if (p >= -SWIPE_KILL) redRef.current = false;
      },
      onPanResponderRelease: (_, g) => {
        const p = pos(g);
        if (openRef.current && p <= -SWIPE_KILL) {
          openRef.current = false;
          Animated.spring(x, { toValue: 0, speed: 18, bounciness: 4, useNativeDriver: false }).start();
          onRemove();
          return;
        }
        const shouldOpen = openRef.current ? g.dx < 40 : g.dx < -50 || g.vx < -0.3;
        openRef.current = shouldOpen;
        Animated.spring(x, {
          toValue: shouldOpen ? -SWIPE_REVEAL : 0,
          speed: 18, bounciness: 4, useNativeDriver: false,
        }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(x, { toValue: 0, speed: 18, bounciness: 4, useNativeDriver: false }).start(),
    })
  ).current;
  const wellBg = x.interpolate({
    inputRange: [0, -SWIPE_REVEAL, -SWIPE_KILL],
    outputRange: ['rgba(220,38,38,0)', c.danger, '#991B1B'],
  });
  const iconOpacity = x.interpolate({
    inputRange: [0, -32, -SWIPE_REVEAL],
    outputRange: [0, 0, 1], // slow reveal: nothing until 1/3 of the swipe
  });
  const iconScale = x.interpolate({
    inputRange: [-SWIPE_REVEAL, -SWIPE_KILL],
    outputRange: [1, 1.15],
  });
  // ponytail: static near-white works on both the near-black well and the
  // red zone — skips Animated color (plain Text can't take Animated values).
  return (
    <View>
      <Animated.View
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: SWIPE_HARD,
          backgroundColor: wellBg,
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 32 }}
          onPress={onRemove}
          accessibilityLabel="Delete card"
        >
          <Animated.View style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
            <Ionicons name="trash-bin" size={26} color="#FAFAFA" />
          </Animated.View>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// Row entrance: fade + rise, staggered by index.
function Row({ index, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1, duration: 300, delay: index * 25, easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Mini theme preview swatch: light, dark, or split (system).
function ThemeSwatch({ id }) {
  const base = { width: 40, height: 26, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' };
  const half = (bg) => ({
    flex: 1, padding: 4, backgroundColor: bg,
    justifyContent: 'center',
  });
  const bar = (bg) => ({ height: 8, borderRadius: 3, backgroundColor: bg, opacity: 0.9 });
  if (id === 'system') {
    return (
      <View style={base}>
        <View style={half(palettes.light.bg)}>
          <View style={bar(palettes.light.surface)} />
        </View>
        <View style={half(palettes.dark.bg)}>
          <View style={bar(palettes.dark.surface)} />
        </View>
      </View>
    );
  }
  const p = palettes[id === 'dark' ? 'dark' : 'light'];
  return (
    <View style={[base, { padding: 4, backgroundColor: p.bg }]}>
      <View style={[bar(p.surface), { flex: 1 }]} />
    </View>
  );
}

// Live caption under each option; System reports the phone's current mode.
const themeCaption = (id, sysScheme) =>
  id === 'system'
    ? `${sysScheme === 'dark' ? 'Dark' : 'Light'} now — follows your phone`
    : id === 'dark'
      ? 'Always dark'
      : 'Always light';

// --- App -------------------------------------------------------------------

export default function App() {
  const [txns, setTxns] = useState([]);
  const [batch, setBatch] = useState(0);
  const [tab, setTab] = useState('spends');
  const [status, setStatus] = useState('idle');
  const [wallet, setWallet] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const [shared, setShared] = useState(null); // { text, action, picks } from share-sheet intake
  const [inspect, setInspect] = useState(null); // tapped txn → SMS debug modal
  const [themePref, setThemePref] = useState(null); // null = loading, else system|dark|light
  const [themeOpen, setThemeOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({}); // month title → rows hidden
  const [busy, setBusy] = useState(false); // SMS scan in flight (pull-to-refresh spinner)

  // First run: load saved theme, then open the onboarding picker if it's new.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((raw) => {
      setThemePref(raw || 'system');
      if (!raw) setThemeOpen(true);
    });
  }, []);

  const pickTheme = (v) => {
    setThemePref(v);
    AsyncStorage.setItem(THEME_KEY, v);
  };

  const sysScheme = useColorScheme();
  const scheme = themePref === 'light' || themePref === 'dark' ? themePref : sysScheme;
  const c = palettes[scheme === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => makeStyles(c), [c]);

  // Page swipe: slide the new tab in from the direction of travel.
  const tabX = useRef(new Animated.Value(0)).current;
  const prevTab = useRef(tab);
  useEffect(() => {
    const order = { spends: 0, portals: 1, cards: 2 };
    const dir = order[tab] > order[prevTab.current] ? 1 : -1;
    prevTab.current = tab;
    tabX.setValue(dir * 30);
    Animated.spring(tabX, {
      toValue: 0, speed: 20, bounciness: 5, useNativeDriver: true,
    }).start();
  }, [tab]);

  useEffect(() => {
    registerNightlyScan();
    // Nightly scans persist txns; load whatever the background task collected.
    loadTxns().then((saved) => {
      if (saved.length) {
        setTxns(saved);
        setStatus(`${saved.length} transactions auto-scanned.`);
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(WALLET_KEY).then((raw) => {
      if (raw) {
        const saved = JSON.parse(raw);
        // Migration: old format was ["cardKey", ...] — new is [{cardKey, last4}].
        const entries = saved.map((e) =>
          typeof e === 'string' ? { cardKey: e, last4: '' } : e
        );
        setWallet(
          entries
            .map((e) => ({ ...cardsData.cards.find((c) => c.cardKey === e.cardKey), last4: e.last4 }))
            .filter((e) => e.cardKey)
        );
        setSelected(Object.fromEntries(entries.map((e) => [e.cardKey, e.last4])));
      } else {
        setPickerOpen(true); // first run: pick cards
      }
    });
  }, []);

  const openPicker = () => {
    setSelected(Object.fromEntries(wallet.map((c) => [c.cardKey, c.last4 || ''])));
    setQuery('');
    setPickerOpen(true);
  };

  // Cards page removal — picker is add-only now.
  const removeCard = (cardKey) => {
    const cards = wallet.filter((c) => c.cardKey !== cardKey);
    setWallet(cards);
    AsyncStorage.setItem(
      WALLET_KEY,
      JSON.stringify(cards.map((c) => ({ cardKey: c.cardKey, last4: c.last4 })))
    );
  };

  const saveWallet = () => {
    const cards = cardsData.cards
      .filter((c) => selected[c.cardKey] !== undefined)
      .map((c) => ({ ...c, last4: (selected[c.cardKey] || '').trim() }));
    setWallet(cards);
    AsyncStorage.setItem(
      WALLET_KEY,
      JSON.stringify(cards.map((c) => ({ cardKey: c.cardKey, last4: c.last4 })))
    );
    setPickerOpen(false);
    setTab('portals'); // first-run landing: recommendations, not the empty ledger
  };

  // Bank (from SMS sender/body) → wallet card. UPI credit lines keyed by the
  // bank name the SMS names: SLICE → slice, SBI → PhonePe SBI, SUPERMONEY →
  // super.money, etc. Normalizes "HDFC BANK"/"KOTAK MAHINDRA" forms.
  const upiCardFor = (t) => {
    if (!t.bank) return null;
    const b = t.bank.replace(/ BANK| MAHINDRA| LIMITED/gi, '').trim().toUpperCase();
    const bankName = (w) => (w.issuer || '').toUpperCase();
    const match = wallet.find(
      (w) =>
        bankName(w) === b ||
        (b === 'SLICE' && w.cardKey === 'slice') ||
        (b === 'SBI' && /phonepe/i.test(w.name)) ||
        (b === 'SUPERMONEY' && /super.?money|supermoney/i.test(w.name)) ||
        (b === 'SALARYSE' && /salaryse/i.test(w.name))
    );
    return match || null;
  };

  // SMS gives only bank + last4. Match against the registered wallet:
  // card last4 for swipe spends, bank name for UPI credit-line spends.
  const matchedFor = (t) =>
    t.cardLast4
      ? wallet.find((w) => w.last4 && w.last4 === t.cardLast4)
      : upiCardFor(t);

  const actionFor = (cat) => (cat ? ACTIONS.find((a) => a.category === cat) : UPI_ACTION);

  // Add one txn's reward to a cap pool (shared by month/cumulative memos).
  const fillPool = (pool, t) => {
    const action = actionFor(merchantCategory(t.merchant));
    if (!action) return;
    const app = action.apps[0];
    const scope = matchedFor(t) ? [matchedFor(t)] : wallet;
    for (const c of scope) {
      const r = rewardFor(c, action, app);
      if (r && r.monthlyCapRs != null && (r.minTxnRs == null || t.amount >= r.minTxnRs)) {
        const key = spentKey(c.cardKey, r);
        pool[key] = (pool[key] || 0) + (t.amount * r.ratePct) / 100;
      }
    }
  };

  const readSms = async () => {
    if (Platform.OS !== 'android') {
      setStatus('SMS read is Android-only.');
      return;
    }
    if (!wallet.length) {
      setStatus('Add your cards first.');
      openPicker();
      return;
    }
    try {
      setBusy(true);
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setStatus('Permission denied. Grant SMS access in settings.');
        return;
      }
      const messages = await SmsReader.readSms(200);
      const parsed = messages
        .map((m) => ({ ...parseSms(m.sender, m.body), date: m.date, raw: m.body }))
        .filter((t) => t.amount != null);
      setBatch((b) => b + 1); // remount rows → re-stagger
      setTxns(parsed);
      // Persist so the nightly task can append on top of these, and the
      // marker skips already-seen SMS next scan.
      AsyncStorage.setItem('card-sage:txns', JSON.stringify(parsed));
      const latest = messages.length
        ? Math.max(...messages.map((m) => new Date(m.date).getTime()))
        : 0;
      AsyncStorage.setItem('card-sage:sms-marker', String(latest));
      setStatus(`Parsed ${parsed.length} card transactions from ${messages.length} messages.`);
    } catch (e) {
      setStatus('Error: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  // Auto-scan once per session once a wallet exists: fresh SMS data on open,
  // no button press. loadTxns above shows last night's scan instantly; this
  // refreshes it. Permission is cached after first grant.
  const autoScanned = useRef(false);
  useEffect(() => {
    if (wallet.length && !autoScanned.current) {
      autoScanned.current = true;
      readSms();
    }
  }, [wallet.length]);

  // Share-sheet intake: the app was opened via Android's share sheet with a
  // link/text (e.g. an Amazon product page). Detect the merchant, recommend
  // the best card, show it as a modal. Runs after the wallet settles.
  const shareChecked = useRef(false);
  useEffect(() => {
    if (wallet.length && !shareChecked.current) {
      shareChecked.current = true;
      ShareReceiver.getSharedContent()
        .then((content) => {
          if (!content) return;
          // Clean URL-ish text into a merchant name for merchantCategory.
          const text = content.text.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
          const cat = merchantCategory(text) || merchantCategory(content.subject);
          if (!cat) {
            setShared({ text: content.text, action: null, picks: [] });
            return;
          }
          const action = actionFor(cat);
          const app = action && action.apps[0];
          const picks = action ? recommend(wallet, action, app, {}) : [];
          setShared({ text: content.text, action, picks });
        })
        .catch(() => {});
    }
  }, [wallet.length]);

  // Reward accrued per card+reward-row, for the cap meter. The cap is in
  // Progressive fills: for each txn, the pool as it stood after every
  // *earlier* txn in that month. Ledger newest-first → top row shows the
  // full month, rows below show partial fills ("cashback so far").
  const cumSpent = useMemo(() => {
    const m = new Array(txns.length);
    for (let i = 0; i < txns.length; i++) {
      const t = txns[i];
      const tDate = new Date(t.date).getTime();
      const pool = {};
      for (const u of txns) {
        if (monthKey(u.date) !== monthKey(t.date)) continue;
        if (new Date(u.date).getTime() > tDate) continue; // only through this txn
        fillPool(pool, u);
      }
      m[i] = pool;
    }
    return m;
  }, [txns, wallet]);

  // reward units (cashback ₹/points), so "used" = txn amount × rate, not the
  // raw amount — otherwise ₹28k spend against a ₹400 cap shows 28305/400.
  // Routed through rewardFor so UPI spends land on the UPI-scoped row that
  // actually earns. When the SMS last4 matches a registered card, only that
  // card's cap depletes.
  const spent = useMemo(() => {
    const m = {};
    for (const t of txns) {
      if (!isCurrentMonth(t.date)) continue; // caps reset monthly
      const action = actionFor(merchantCategory(t.merchant));
      if (!action) continue;
      const app = action.apps[0];
      const scope = matchedFor(t) ? [matchedFor(t)] : wallet;
      for (const c of scope) {
        const r = rewardFor(c, action, app);
        // Minimum-transaction rows: spends below the threshold earn nothing.
        if (r && r.monthlyCapRs != null && (r.minTxnRs == null || t.amount >= r.minTxnRs)) {
          const key = spentKey(c.cardKey, r);
          m[key] = (m[key] || 0) + (t.amount * r.ratePct) / 100;
        }
      }
    }
    return m;
  }, [txns, wallet]);

  const rows = useMemo(() => {
    return txns.slice(0, 30).map((t, i) => {
      const cat = merchantCategory(t.merchant);
      const action = actionFor(cat);
      const app = action.apps[0];
      const matched = matchedFor(t);
      const scope = matched ? [matched] : wallet;
      // Cap pools are per month AND per point-in-time — each row's meter
      // shows the pool as it stood after that txn, filling progressively.
      const spentM = cumSpent[i] || {};
      // Cards with min-txn thresholds below this amount earn nothing here.
      const earning = (p) => !(p.reward.minTxnRs && t.amount < p.reward.minTxnRs);
      const rawPicks = recommend(scope, action, app, spentM);
      const picks = rawPicks.filter(earning);
      const excluded = rawPicks.find((p) => !earning(p));
      // When the used card is known, also show the best alternative.
      const best = matched ? recommend(wallet, action, app, spentM).filter(earning)[0] : null;
      return { t, cat, upi: !cat && !t.cardLast4, matched, top: picks[0], best, excluded };
    });
  }, [txns, wallet, cumSpent]);

  // Ledger grouped by month; header = month + scanned total, tap collapses.
  // Rows keep their global index so expand/collapse doesn't reshape keys.
  const sections = useMemo(() => {
    const byMonth = new Map();
    rows.forEach((r, i) => {
      const d = new Date(r.t.date);
      const title = isNaN(d.getTime())
        ? 'Unknown'
        : d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      if (!byMonth.has(title)) byMonth.set(title, []);
      byMonth.get(title).push({ ...r, i });
    });
    return [...byMonth].map(([title, data]) => ({
      title,
      total: data.reduce((s, r) => s + r.t.amount, 0),
      data: collapsed[title] ? [] : data,
    }));
  }, [rows, collapsed]);

  // Header: potential cashback from card-matched rows only, bounded by
  // remaining cap. Labeled "potential" — SMS batch is not a statement.
  const summary = useMemo(() => {
    let scanned = 0;
    let potential = 0;
    for (const t of txns) {
      if (!isCurrentMonth(t.date)) continue; // caps reset monthly
      scanned += t.amount;
      const matched = matchedFor(t);
      if (!matched) continue;
      const action = actionFor(merchantCategory(t.merchant));
      const r = action && rewardFor(matched, action, action.apps[0]);
      if (!r || (r.minTxnRs && t.amount < r.minTxnRs)) continue;
      const cap = r.monthlyCapRs;
      const key = spentKey(matched.cardKey, r);
      const remaining = cap != null ? Math.max(0, cap - (spent[key] || 0)) : Infinity;
      potential += Math.min((r.ratePct / 100) * t.amount, remaining);
    }
    return { scanned, potential, n: txns.length };
  }, [txns, wallet, spent]);

  const count = Object.keys(selected).filter((k) => selected[k]).length;

  // Spend-based recommender: every card (owned or not) × this month's txns →
  // realistic earnings (spend × rate, held at the monthly cap). NOT the cap
  // number — a recharge-only spender sees ~10% of recharges, not ₹2000.
  const cardEarnings = useMemo(() => {
    const out = [];
    for (const card of cardsData.cards) {
      let total = 0;
      const byCat = {};
      for (const t of txns) {
        if (!isCurrentMonth(t.date)) continue;
        const action = actionFor(merchantCategory(t.merchant));
        if (!action) continue;
        const r = rewardFor(card, action, action.apps[0]);
        if (!r) continue;
        if (r.minTxnRs != null && t.amount < r.minTxnRs) continue;
        const e = (t.amount * r.ratePct) / 100;
        byCat[r.category] = (byCat[r.category] || 0) + e;
        if (r.monthlyCapRs == null) total += e;
        else total += Math.min(e, Math.max(0, r.monthlyCapRs - (byCat[r.category] - e)));
      }
      if (total > 0) {
        const topCat = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
        out.push({ card, earned: total, drivers: byCat, topCat });
      }
    }
    return out.sort((a, b) => b.earned - a.earned);
  }, [txns, wallet]);

  // Per-card cap usage: the most-consumed capped reward row per card.
  const cardUsage = useMemo(() => {
    const m = {};
    for (const card of wallet) {
      let best = null;
      for (const t of txns) {
        const action = actionFor(merchantCategory(t.merchant));
        const r = action && rewardFor(card, action, action.apps[0]);
        if (!r || r.monthlyCapRs == null) continue;
        if (r.minTxnRs && t.amount < r.minTxnRs) continue;
        const used = spent[spentKey(card.cardKey, r)] || 0;
        if (!best || used > best.used) best = { used, cap: r.monthlyCapRs, cat: r.category };
      }
      if (best) m[card.cardKey] = best;
    }
    return m;
  }, [wallet, txns, spent]);

  return (
    <ThemeContext.Provider value={scheme}>
      <View style={styles.container}>
      {tab === 'cards' ? (
        <CardsPage
          c={c} styles={styles} wallet={wallet} cardUsage={cardUsage} openPicker={openPicker}
          onRemove={removeCard} earnings={cardEarnings}
        />
      ) : tab === 'portals' ? (
        <PortalsPage c={c} styles={styles} wallet={wallet} spent={spent} openPicker={openPicker} />
      ) : (
        <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
            <Text style={styles.markText}>₹</Text>
          </LinearGradient>
          <Text style={styles.logo}>CARD SAGE</Text>
        </View>
        <Text style={styles.sub}>
          {wallet.length ? wallet.length + ' cards' : 'no cards'} · {summary.n} txns ·{' '}
          ₹{summary.scanned.toLocaleString('en-IN')} scanned
        </Text>
        {summary.n > 0 ? (
          <Fan
            c={c}
            front={
              <View style={styles.potentialBody}>
                <Text style={styles.potentialLabel}>POTENTIAL CASHBACK</Text>
                <CountUp value={Math.round(summary.potential)} style={styles.potentialValue} />
              </View>
            }
          />
        ) : null}
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${batch}:${item.i}`}
        stickySectionHeadersEnabled={false}
        style={{ width: '100%', marginTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={readSms}
            colors={[c.earn]}
            tintColor={c.earn}
            progressBackgroundColor={c.surface}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.hairline} />}
        renderSectionHeader={({ section }) => (
          <Pressable
            style={styles.monthHeader}
            onPress={() => setCollapsed((c) => ({ ...c, [section.title]: !c[section.title] }))}
          >
            <Text style={styles.monthTitle}>{section.title}</Text>
            <Text style={styles.monthTotal}>₹{section.total.toLocaleString('en-IN')} scanned</Text>
            <Text style={styles.monthChevron}>
              {collapsed[section.title] ? '▸' : '▾'}
            </Text>
          </Pressable>
        )}
        renderItem={({ item, index }) => {
          const verdict = (() => {
            // Card-lit txns are card spends even without a known merchant;
            // only cardless UPI person-pays are not.
            const label = item.t.bank || item.cat || (item.t.cardLast4 ? 'Unknown merchant' : 'UPI');
            if (item.top) {
              return (
                <View>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta} numberOfLines={1}>
                      {label}
                      {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                    </Text>
                    <Chip color={c.earn} onPress={() => shareVerdict(item)}>
                      ✓ {shortName(item.top.card.name)} — {item.top.reward.netPct}%
                    </Chip>
                  </View>
                  {item.top.cap != null ? (
                    <CapMeter
                      used={item.top.used}
                      cap={item.top.cap}
                      c={c}
                      label={`₹${Math.round(item.top.used).toLocaleString('en-IN')} cashback after this`}
                    />
                  ) : null}
                </View>
              );
            }
            if (item.excluded) {
              return (
                <View style={styles.metaRow}>
                  <Text style={styles.meta} numberOfLines={1}>
                    {label}
                    {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                  </Text>
                  <Chip color={c.warn} onPress={() => shareVerdict(item)}>
                    {shortName(item.excluded.card.name)} — needs ₹{item.excluded.reward.minTxnRs} min
                  </Chip>
                </View>
              );
            }
            // Unmappable (UPI person pays) or no reward row — quiet, honest.
            return (
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {label}
                  {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                </Text>
                <Chip color={c.muted}>
                  {item.upi ? 'not a card spend' : 'no reward row'}
                </Chip>
              </View>
            );
          })();
          return (
            <Row index={index}>
              <Pressable style={styles.row} onPress={() => setInspect(item.t)}>
                <View style={styles.rowTop}>
                  <Text style={styles.merchant} numberOfLines={1}>
                    {item.t.merchant || (item.t.cardLast4 ? 'Unknown merchant' : 'UPI')}
                  </Text>
                  <Text style={styles.amt}>₹{item.t.amount.toLocaleString('en-IN')}</Text>
                </View>
                {verdict}
              </Pressable>
            </Row>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Fan
              c={c}
              front={
                <View style={styles.potentialBody}>
                  <Text style={styles.potentialLabel}>YOUR WALLET</Text>
                  <Text style={styles.emptyText}>
                    {wallet.length
                      ? 'No transactions yet — read SMS to scan your bank alerts.'
                      : 'Add your cards first — they power every recommendation.'}
                  </Text>
                </View>
              }
/>
            <View style={{ marginTop: 16, alignSelf: 'flex-start' }}>
              {wallet.length ? (
                <Btn title="📩 Scan SMS" color={c.earn} primary onPress={readSms} />
              ) : (
                <Btn title="＋ Add your cards" color={c.earn} primary onPress={openPicker} />
              )}
            </View>
          </View>
        }
      />

      </View>
      )}
      <Dock tab={tab} setTab={setTab} c={c} styles={styles} />

      <Modal visible={pickerOpen} animationType="slide">
        <View style={styles.pickerContainer}>
          <View style={styles.logoRow}>
            <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
              <Text style={styles.markText}>₹</Text>
            </LinearGradient>
            <Text style={styles.logo}>YOUR CARDS</Text>
          </View>
          <Text style={styles.sub}>Pick every card you own. Recommendations use only these.</Text>
          <TextInput
            style={styles.search}
            placeholder="Search: ultimo, amazon, swiggy…"
            placeholderTextColor={c.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <FlatList
            data={(() => {
              const q = query.toLowerCase();
              const all = cardsData.cards.filter(
                (c) =>
                  !q ||
                  c.name.toLowerCase().includes(q) ||
                  (c.issuer || '').toLowerCase().includes(q)
              );
              const on = (c) => selected[c.cardKey] !== undefined;
              // Pick your existing cards first — cancelling is one tap away.
              return [...all.filter(on), ...all.filter((c) => !on(c))];
            })()}
            keyExtractor={(c) => c.cardKey}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 20 }}
            ItemSeparatorComponent={() => <View style={styles.hairline} />}
            renderItem={({ item }) => {
              const on = selected[item.cardKey] !== undefined;
              return (
                <View style={[styles.cardRow, on && styles.cardRowOn]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, on && { color: c.earn }]}>{item.name}</Text>
                    <Text style={styles.cardSub}>
                      {item.issuer} · {item.tier}
                      {item.lifetimeFree ? '' : ` · ₹${item.annualFeeRs}/yr`}
                    </Text>
                    {on ? (
                      <TextInput
                        style={styles.last4}
                        placeholder="last 4 digits (matches SMS)"
                        placeholderTextColor={c.muted}
                        keyboardType="number-pad"
                        maxLength={4}
                        value={selected[item.cardKey]}
                        onChangeText={(v) =>
                          setSelected((s) => ({ ...s, [item.cardKey]: v }))
                        }
                      />
                    ) : null}
                  </View>
                  <View style={{ width: 96 }}>
                    <Btn
                      title={on ? 'Added' : 'Add'}
                      color={on ? c.sub : c.earn}
                      small
                      onPress={() =>
                        on
                          ? null // add-only: un-adding happens on the Cards page
                          : setSelected((s) => ({ ...s, [item.cardKey]: '' }))
                      }
                    />
                  </View>
                </View>
              );
            }}
          />
          <View style={{ gap: 10, marginTop: 12 }}>
            <Btn title={`Save ${count} card${count === 1 ? '' : 's'}`} color={c.earn} primary onPress={saveWallet} />
            <Btn title="Cancel" color={c.muted} onPress={() => setPickerOpen(false)} />
          </View>
        </View>
      </Modal>

      {shared ? (
        <Modal visible animationType="slide" onRequestClose={() => setShared(null)}>
          <View style={styles.pickerContainer}>
            <View style={styles.logoRow}>
              <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
                <Text style={styles.markText}>₹</Text>
              </LinearGradient>
              <Text style={styles.logo}>BEST CARD FOR THIS</Text>
            </View>
            <Text style={styles.cardSub} numberOfLines={3}>
              {shared.text}
            </Text>
            {shared.action && shared.picks.length ? (
              <View style={{ marginTop: 16, gap: 10 }}>
                {shared.picks.slice(0, 3).map((p, i) => (
                  <View key={p.card.cardKey} style={styles.sharePick}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{shortName(p.card.name)}</Text>
                      <Text style={styles.cardSub}>
                        {humanize(shared.action.category)} · ₹{p.reward.ratePct}% rate
                      </Text>
                    </View>
                    <Chip color={i === 0 ? c.earn : c.sub}>
                      {p.reward.netPct}% net
                    </Chip>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.status}>
                  {shared.action
                    ? 'No wallet card earns here — add one in Cards.'
                    : 'Could not match a merchant — shared text is not a known store.'}
                </Text>
              </View>
            )}
            <View style={{ gap: 10, marginTop: 20 }}>
              <Btn title="Close" color={c.earn} primary onPress={() => setShared(null)} />
            </View>
          </View>
        </Modal>
      ) : null}

      {inspect ? (
        <Modal visible animationType="slide" onRequestClose={() => setInspect(null)}>
          <View style={styles.pickerContainer}>
            <View style={styles.logoRow}>
              <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
                <Text style={styles.markText}>₹</Text>
              </LinearGradient>
              <Text style={styles.logo}>IS THIS RIGHT?</Text>
            </View>
            <View style={styles.debugBox}>
              <Text style={styles.cardSub} selectable>
                {inspect.raw || '(no raw body — persisted txn)'}
              </Text>
            </View>
            <Text style={styles.status}>
              Found ₹{inspect.amount.toLocaleString('en-IN')} · {inspect.merchant || 'UPI'} ·{' '}
              {merchantCategory(inspect.merchant) || 'unmapped'}. Wrong? Tap thumbs-down — the
              SMS text is shared back to us for fixing.
            </Text>
            <View style={{ gap: 10, marginTop: 20 }}>
              <Btn
                title="👍 Looks right"
                color={c.earn}
                primary
                onPress={() => setInspect(null)}
              />
              <Btn
                title="👎 Not right"
                color={c.danger}
                onPress={() => {
                  setInspect(null);
                  Share.share({
                    message: `[CardSage ✗] ${inspect.sender} ${new Date(inspect.date).toISOString()}\n${inspect.raw}\n→ ₹${inspect.amount} · ${inspect.merchant || 'UPI'} · ${merchantCategory(inspect.merchant) || 'unmapped'}`,
                  });
                }}
              />
              <Btn title="Close" color={c.muted} onPress={() => setInspect(null)} />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* First-run theme onboarding: tap to re-theme live behind this screen. */}
      <Modal visible={themeOpen} animationType="fade">
        <View style={styles.pickerContainer}>
          <View style={styles.logoRow}>
            <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
              <Text style={styles.markText}>₹</Text>
            </LinearGradient>
            <Text style={styles.logo}>PICK YOUR THEME</Text>
          </View>
          <Text style={styles.sub}>
            Tap to preview live — the app behind this screen flips instantly.
          </Text>
          {THEME_OPTIONS.map((o) => {
            const on = themePref === o.id;
            return (
              <Pressable
                key={o.id}
                style={[styles.themeRow, on && { borderColor: c.earn + '88', backgroundColor: c.earn + '0F' }]}
                onPress={() => pickTheme(o.id)}
              >
                <ThemeSwatch id={o.id} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, on && { color: c.earn }]}>{o.label}</Text>
                  <Text style={styles.cardSub}>{themeCaption(o.id, sysScheme)}</Text>
                </View>
                <View style={[styles.radio, on && { borderColor: c.earn }]}>
                  {on ? <View style={[styles.radioDot, { backgroundColor: c.earn }]} /> : null}
                </View>
              </Pressable>
            );
          })}
          <View style={{ marginTop: 24 }}>
            <Btn title="Continue" color={c.earn} onPress={() => setThemeOpen(false)} />
          </View>
        </View>
      </Modal>

      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </ThemeContext.Provider>
  );
}

// --- Pages & dock ---------------------------------------------------------

const issuerColors = {
  HDFC: ['#003C8F', '#2E7BD6'], SBI: ['#1E3A8A', '#3B82F6'],
  ICICI: ['#B91C1C', '#EF4444'], AXIS: ['#7F1D1D', '#DC2626'],
  DCB: ['#312E81', '#6366F1'], AMEX: ['#065F46', '#10B981'],
  RBL: ['#1F2937', '#4B5563'], IDFC: ['#1E40AF', '#2563EB'],
  SLICE: ['#C4134B', '#F53DC4'],
};
const issuerGradient = (c, issuer) =>
  issuerColors[String(issuer).toUpperCase()] || [c.surface, c.surface];
const humanize = (s) =>
  (s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const cardType = (name) => (/debit/i.test(name) ? 'DEBIT' : 'CREDIT');
const shortName = (n) => n.replace(/ (Credit|Debit|Charge) Card$/, '');
// Portal accent: color dot per action, matches card-face palette language.
const PORTAL_COLORS = {
  'mobile-recharge': ['#2563EB', '#60A5FA'], 'electricity-bill': ['#F59E0B', '#FBBF24'],
  'dth-recharge': ['#7C3AED', '#A78BFA'], 'gas-cylinder': ['#DC2626', '#F87171'],
  insurance: ['#0D9488', '#2DD4BF'], 'credit-card-bill': ['#374151', '#6B7280'],
  fastag: ['#0891B2', '#22D3EE'], fuel: ['#B45309', '#F59E0B'],
  ott: ['#DB2777', '#F472B6'], grocery: ['#16A34A', '#4ADE80'],
  'online-shopping': ['#EA580C', '#FB923C'], dining: ['#E11D48', '#FB7185'],
  travel: ['#1D4ED8', '#3B82F6'], education: ['#6D28D9', '#8B5CF6'],
  rent: ['#334155', '#64748B'], 'wallet-load': ['#047857', '#34D399'],
};
const portalGradient = (c, id) => PORTAL_COLORS[id] || [c.surface, c.earn + '22'];

// Share a single recommendation verdict via the system share sheet.
const shareVerdict = async (item) => {
  const lines = [];
  if (item.t) {
    lines.push(`${item.t.merchant || '(upi)'} — ₹${item.t.amount.toLocaleString('en-IN')}`);
  }
  if (item.top) {
    lines.push(
      `Best card: ${item.top.card.name} — ${item.top.reward.netPct}% net cashback`
    );
  }
  if (item.excluded) {
    lines.push(
      `${item.excluded.card.name} needs ₹${item.excluded.reward.minTxnRs} min txn`
    );
  }
  if (item.upi && !item.top) lines.push('Not a card spend — UPI person pay');
  try {
    await Share.share({ message: lines.join('\n') });
  } catch (e) {
    /* user dismissed — nothing to do */
  }
};

function PortalsPage({ c, styles, wallet, spent, openPicker }) {
  const [sel, setSel] = useState(null); // tapped action → recommendation modal
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
            <Text style={styles.markText}>₹</Text>
          </LinearGradient>
          <Text style={styles.logo}>PAY PORTALS</Text>
        </View>
        <Text style={styles.sub}>
          Tap an action — best card + where to pay. Fee charged by the app: 0% = no card fee.
        </Text>
      </View>
      <FlatList
        data={ACTIONS.filter((a) => a.id !== 'upi')}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingBottom: 16 }}
        ItemSeparatorComponent={() => <View style={styles.hairline} />}
        renderItem={({ item }) => (
          <Pressable style={styles.portalRow} onPress={() => setSel(item)}>
            <View style={styles.rowTop}>
              <View style={styles.portalTitleRow}>
                <View style={[styles.portalDot, { backgroundColor: portalGradient(c, item.id)[0] }]} />
                <Text style={styles.merchant} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <Text style={[styles.meta, { flex: 0 }]}>tap →</Text>
            </View>
            {item.note ? <Text style={styles.cardSub}>{item.note}</Text> : null}
            <View style={{ gap: 6, marginTop: 6 }}>
              {item.apps.map((app) => (
                <View key={app.id} style={styles.portalApp}>
                  <Text style={[styles.cardSub, { flex: 1, color: c.text }]} numberOfLines={1}>
                    {app.label}
                    {app.cardKey ? ' · ' + shortName((cardsData.cards.find((cd) => cd.cardKey === app.cardKey) || {}).name || '') : ''}
                  </Text>
                  <Chip color={app.feePct > 0 ? c.warn : c.earn}>
                    {app.feePct > 0 ? `${app.feePct}% fee` : '0% fee'}
                  </Chip>
                </View>
              ))}
            </View>
          </Pressable>
        )}
      />

      {sel ? (
        <PortalModal
          c={c} styles={styles} action={sel} wallet={wallet} spent={spent}
          onClose={() => setSel(null)} openPicker={openPicker}
        />
      ) : null}
    </View>
  );
}

// Tap on a portal action → best card for the category + apps that open the
// actual payment destination. Opens the app/browser via Linking.
function PortalModal({ c, styles, action, wallet, spent, onClose, openPicker }) {
  const app = action.apps[0];
  const picks = recommend(wallet, action, app, spent);
  // recommend already ranks by net rate; no min-txn filter here since the
  // portal txn amount is unknown (hardcoded ₹500 threshold was wrong for
  // big-ticket actions like flights).
  const best = picks[0];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickerContainer}>
<View style={styles.logoRow}>
            <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
              <Text style={styles.markText}>₹</Text>
            </LinearGradient>
            <Text style={styles.logo}>{action.label.toUpperCase()}</Text>
          </View>

        <View style={{ marginTop: 14 }}>
          <Text style={styles.potentialLabel}>BEST CARD</Text>
          {best ? (
            <View style={[styles.portalApp, { marginTop: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{shortName(best.card.name)}</Text>
                <Text style={styles.cardSub}>
                  {best.reward.netPct}% net cashback
                  {best.reward.monthlyCapRs != null ? ` · cap ₹${best.reward.monthlyCapRs.toLocaleString('en-IN')}` : ''}
                </Text>
              </View>
              <Chip color={c.earn}>{best.reward.netPct}%</Chip>
            </View>
          ) : (
            <Text style={styles.status}>No wallet card earns here — add one in Cards.</Text>
          )}
        </View>

        <Text style={[styles.potentialLabel, { marginTop: 18 }]}>WHERE TO PAY</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {action.apps.map((app) => (
            <Pressable
              key={app.id}
              style={[styles.portalApp, { backgroundColor: c.surface }]}
              onPress={() => app.url && Linking.openURL(app.url)}
            >
              <Text style={[styles.cardSub, { flex: 1, color: c.text }]} numberOfLines={1}>
                {app.label}
              </Text>
              <Chip color={app.feePct > 0 ? c.warn : c.earn}>
                {app.feePct > 0 ? `${app.feePct}% fee` : '0% fee'}
              </Chip>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 10, marginTop: 20 }}>
          <Btn title="Close" color={c.earn} primary onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function CardsPage({ c, styles, wallet, cardUsage, openPicker, onRemove, earnings }) {
  if (!wallet.length) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
              <Text style={styles.markText}>₹</Text>
            </LinearGradient>
            <Text style={styles.logo}>YOUR CARDS</Text>
          </View>
        </View>
        <View style={styles.empty}>
          <Fan
            c={c}
            front={
              <View style={styles.potentialBody}>
                <Text style={styles.potentialLabel}>YOUR WALLET</Text>
                <Text style={styles.emptyText}>
                  No cards yet. Add them — every recommendation starts here.
                </Text>
              </View>
            }
          />
          <View style={{ marginTop: 16, alignSelf: 'flex-start' }}>
            <Btn title="Add your cards" color={c.earn} primary onPress={openPicker} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LinearGradient colors={[c.earn, c.earn + 'CC']} style={styles.mark}>
            <Text style={styles.markText}>₹</Text>
          </LinearGradient>
          <Text style={styles.logo}>YOUR CARDS</Text>
        </View>
        <Text style={styles.sub}>{wallet.length} cards · cap usage from this batch</Text>
        <View style={[styles.actions, { marginTop: 10 }]}>
          <Btn title="+ Add card" color={c.earn} onPress={openPicker} />
        </View>
      </View>
      {earnings.length ? (
        <View style={styles.earnPanel}>
          <Text style={styles.potentialLabel}>BEST FOR YOUR SPENDS</Text>
          {earnings.slice(0, 3).map((e, i) => {
            const owned = wallet.some((w) => w.cardKey === e.card.cardKey);
            return (
              <Pressable
                key={e.card.cardKey}
                style={styles.earnRow}
                onPress={owned ? null : openPicker}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, i === 0 && { color: c.earn, fontWeight: '800' }]}>
                    {i === 0 ? '★ ' : ''}{shortName(e.card.name)}
                  </Text>
                  <Text style={styles.cardSub}>
                    {humanize(e.topCat).toLowerCase()} · ₹{Math.round(e.earned).toLocaleString('en-IN')}/mo
                  </Text>
                </View>
                {owned ? (
                  <Chip color={c.earn}>in wallet</Chip>
                ) : (
                  <Chip color={c.warn} onPress={openPicker}>add</Chip>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <FlatList
        data={wallet}
        keyExtractor={(x) => x.cardKey}
        contentContainerStyle={{ paddingBottom: 16 }}
        ItemSeparatorComponent={() => <View style={styles.hairline} />}
        renderItem={({ item }) => {
          const u = cardUsage[item.cardKey];
          return (
            <SwipeCard c={c} styles={styles} onRemove={() => onRemove(item.cardKey)}>
              <View style={styles.cardPageRow}>
                <LinearGradient colors={issuerGradient(c, item.issuer)} style={styles.cardFace}>
                  <View style={styles.cardFaceTop}>
                    <Text style={styles.cardFaceIssuer}>{item.issuer}</Text>
                    <Text style={styles.cardFaceType}>{cardType(item.name)}</Text>
                  </View>
                  <View style={styles.cardFaceBottom}>
                    <Text style={styles.cardFaceName} numberOfLines={1}>
                      {shortName(item.name)}
                    </Text>
                    <Text style={styles.cardFaceLast4}>•••• {item.last4 || '—'}</Text>
                  </View>
                </LinearGradient>
                {u ? (
                  <View style={{ marginTop: 12 }}>
                    <CapMeter
                      used={u.used}
                      cap={u.cap}
                      c={c}
                      label={`${humanize(u.cat)} cap — ₹${u.used.toLocaleString('en-IN')}/${u.cap.toLocaleString('en-IN')} used`}
                    />
                  </View>
                ) : (
                  <Text style={[styles.meta, { marginTop: 12 }]}>no capped spends in this batch</Text>
                )}
              </View>
            </SwipeCard>
          );
        }}
      />
    </View>
  );
}

function Dock({ tab, setTab, c, styles }) {
  const tabs = [
    { id: 'spends', label: 'Spends' },
    { id: 'portals', label: 'Portals' },
    { id: 'cards', label: 'Cards' },
  ];
  return (
    <View style={styles.dock}>
      {tabs.map((t) => {
        const on = tab === t.id;
        return (
          <Pressable key={t.id} style={styles.dockTab} onPress={() => setTab(t.id)}>
            <Text style={[styles.dockLabel, { color: on ? c.earn : c.sub, fontWeight: on ? '800' : '600' }]}>
              {t.label}
            </Text>
            {on ? <View style={[styles.dockDot, { backgroundColor: c.earn }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
    header: { marginBottom: 20 },
    logoRow: { flexDirection: 'row', alignItems: 'center' },
    mark: {
      width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      marginRight: 8,
    },
    markText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    logo: { fontSize: 13, fontWeight: '800', letterSpacing: 2, color: c.text },
    sub: { fontSize: 13, color: c.sub, marginTop: 6 },
    fan: { marginTop: 16, height: 84, marginBottom: 6 },
    fanCard: {
      position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
      borderRadius: 14, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface,
    },
    fanFront: { padding: 14, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    potentialBody: { justifyContent: 'center', height: '100%' },
    potentialLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: c.sub },
    potentialValue: { fontSize: 26, fontWeight: '800', color: c.earn, fontVariant: ['tabular-nums'], marginTop: 2 },
    empty: { marginTop: 24 },
    emptyText: { fontSize: 13, color: c.sub, marginTop: 6, lineHeight: 19 },
    actions: { flexDirection: 'row', gap: 10, marginBottom: 4, marginTop: 2 },
    btn: {
      borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    btnSmall: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    btnText: { fontSize: 14, fontWeight: '700' },
    btnTextSmall: { fontSize: 12, fontWeight: '600' },
    status: { fontSize: 13, color: c.sub, marginTop: 8, marginBottom: 4 },
    row: { paddingVertical: 12 },
    rowTop: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    },
    merchant: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1, marginRight: 12 },
    amt: {
      fontSize: 17, fontWeight: '700', color: c.amount, fontVariant: ['tabular-nums'],
    },
    metaRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 6,
    },
    meta: { fontSize: 11, color: c.sub, letterSpacing: 0.3, marginRight: 8, flex: 1, flexShrink: 1 },
    chip: {
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
      flexShrink: 1,
    },
    chipText: { fontSize: 12, fontWeight: '600' },
    hairline: { height: 1, backgroundColor: c.hairline },
    meterWrap: { marginTop: 8 },
    meterTrack: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
    meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
    meterDrop: {
      position: 'absolute', top: 10, width: 8, height: 10, borderRadius: 4,
      backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.3,
      shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
    },
    meterLabel: { fontSize: 11, color: c.sub, marginTop: 4 },
    monthHeader: {
      flexDirection: 'row', alignItems: 'baseline', gap: 8,
      paddingVertical: 10, paddingHorizontal: 2, backgroundColor: c.bg,
    },
    monthTitle: {
      fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
      textTransform: 'uppercase', color: c.earn,
    },
    monthTotal: { fontSize: 11, color: c.sub },
    monthChevron: { fontSize: 11, color: c.sub, marginLeft: 'auto' },
    pickerContainer: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
    search: {
      backgroundColor: c.surface, borderRadius: 10, padding: 12, marginVertical: 12,
      borderWidth: 1, borderColor: c.hairline, color: c.text, fontSize: 15,
    },
    cardRow: {
      paddingVertical: 12, paddingHorizontal: 10, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
    cardRowOn: {
      borderWidth: 1, borderColor: c.earn + '66', borderRadius: 12,
      backgroundColor: c.surface, marginVertical: 4,
      elevation: 3, shadowColor: '#000', shadowOpacity: 0.15,
      shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    cardName: { fontSize: 14, fontWeight: '600', color: c.text },
    cardSub: { fontSize: 11, color: c.sub, marginTop: 2 },
    themeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      padding: 12, borderWidth: 1, borderColor: 'transparent', borderRadius: 12,
      marginVertical: 4,
    },
    radio: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.hairline,
      alignItems: 'center', justifyContent: 'center',
    },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    last4: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: 8,
      padding: 8, marginTop: 8, fontSize: 13, color: c.text,
    },
    dock: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.hairline,
      backgroundColor: c.surface, marginHorizontal: -20, marginBottom: -20,
      paddingTop: 4, paddingBottom: 18,
    },
    dockTab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
    dockLabel: { fontSize: 12, letterSpacing: 0.5 },
    dockDot: { width: 4, height: 4, borderRadius: 2 },
    cardPageRow: { paddingVertical: 16 },
    portalRow: { paddingVertical: 14 },
    portalTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    portalDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8, flexShrink: 0 },
    portalApp: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    },
    sharePick: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    },
    debugBox: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline,
      borderRadius: 10, padding: 12, marginTop: 10, maxHeight: 220,
    },
    cardFace: {
      height: 168, borderRadius: 18, padding: 18, justifyContent: 'space-between',
      elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    cardFaceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardFaceIssuer: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
    cardFaceType: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    cardFaceBottom: {},
    cardFaceName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    cardFaceLast4: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: 4, letterSpacing: 2 },
    earnPanel: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline,
      borderRadius: 14, padding: 12, marginBottom: 14, gap: 4,
    },
    earnRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.hairline,
    },
  });
