import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Button, FlatList, LayoutAnimation, Modal, PermissionsAndroid, Platform,
  StyleSheet, Text, TextInput, UIManager, useColorScheme, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import cardsData from '../../src/data/cards.json';
import { ACTIONS } from '../../src/engine/actions';
import { recommend, rewardFor } from '../../src/engine/recommend';
import { parseSms } from '../../src/engine/sms';
import { merchantCategory } from '../../src/engine/merchants';
import SmsReader from './modules/sms-reader';

// Unmapped merchants (UPI person payments etc.) route through the UPI action.
const UPI_ACTION = ACTIONS.find((a) => a.id === 'upi');
const WALLET_KEY = 'card-sage:wallet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

export default function App() {
  const [txns, setTxns] = useState([]);
  const [status, setStatus] = useState('idle');
  const [wallet, setWallet] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});

  const scheme = useColorScheme();
  const c = palettes[scheme === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => makeStyles(c), [c]);

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
  };

  // SMS gives only bank + last4. Match against the registered wallet.
  const matchedFor = (t) =>
    t.cardLast4 ? wallet.find((w) => w.last4 && w.last4 === t.cardLast4) : null;

  const actionFor = (cat) => (cat ? ACTIONS.find((a) => a.category === cat) : UPI_ACTION);

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
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setStatus('Permission denied. Grant SMS access in settings.');
        return;
      }
      const messages = await SmsReader.readSms(200);
      const parsed = messages
        .map((m) => ({ ...parseSms(m.sender, m.body), date: m.date }))
        .filter((t) => t.amount != null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTxns(parsed);
      setStatus(`Parsed ${parsed.length} card transactions from ${messages.length} messages.`);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

  // Spend per card+reward-row, for the cap meter. Routed through rewardFor so
  // UPI spends land on the UPI-scoped row that actually earns. When the SMS
  // last4 matches a registered card, only that card's cap depletes.
  const spent = useMemo(() => {
    const m = {};
    for (const t of txns) {
      const action = actionFor(merchantCategory(t.merchant));
      if (!action) continue;
      const app = action.apps[0];
      const scope = matchedFor(t) ? [matchedFor(t)] : wallet;
      for (const c of scope) {
        const r = rewardFor(c, action, app);
        // Minimum-transaction rows: spends below the threshold earn nothing.
        if (r && r.monthlyCapRs != null && (r.minTxnRs == null || t.amount >= r.minTxnRs)) {
          const key = `${c.cardKey}:${r.category}`;
          m[key] = (m[key] || 0) + t.amount;
        }
      }
    }
    return m;
  }, [txns, wallet]);

  const rows = useMemo(() => {
    return txns.slice(0, 30).map((t) => {
      const cat = merchantCategory(t.merchant);
      const action = actionFor(cat);
      const app = action.apps[0];
      const matched = matchedFor(t);
      const scope = matched ? [matched] : wallet;
      // Cards with min-txn thresholds below this amount earn nothing here.
      const earning = (p) => !(p.reward.minTxnRs && t.amount < p.reward.minTxnRs);
      const rawPicks = recommend(scope, action, app, spent);
      const picks = rawPicks.filter(earning);
      const excluded = rawPicks.find((p) => !earning(p));
      // When the used card is known, also show the best alternative.
      const best = matched ? recommend(wallet, action, app, spent).filter(earning)[0] : null;
      return { t, cat, upi: !cat, matched, top: picks[0], best, excluded };
    });
  }, [txns, wallet, spent]);

  // Header: potential cashback from card-matched rows only, bounded by
  // remaining cap. Labeled "potential" — SMS batch is not a statement.
  const summary = useMemo(() => {
    let scanned = 0;
    let potential = 0;
    for (const t of txns) {
      scanned += t.amount;
      const matched = matchedFor(t);
      if (!matched) continue;
      const action = actionFor(merchantCategory(t.merchant));
      const r = action && rewardFor(matched, action, action.apps[0]);
      if (!r || (r.minTxnRs && t.amount < r.minTxnRs)) continue;
      const cap = r.monthlyCapRs;
      const key = `${matched.cardKey}:${r.category}`;
      const remaining = cap != null ? Math.max(0, cap - (spent[key] || 0)) : Infinity;
      potential += Math.min((r.ratePct / 100) * t.amount, remaining);
    }
    return { scanned, potential, n: txns.length };
  }, [txns, wallet, spent]);

  const count = Object.keys(selected).filter((k) => selected[k]).length;
  const shortName = (n) => n.replace(/ (Credit|Debit|Charge) Card$/, '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>CARD SAGE</Text>
        <Text style={styles.sub}>
          {wallet.length ? wallet.length + ' cards' : 'no cards'} · {summary.n} txns ·{' '}
          ₹{summary.scanned.toLocaleString('en-IN')} scanned
        </Text>
        {summary.n > 0 ? (
          <View style={styles.potentialRow}>
            <Text style={styles.potentialLabel}>POTENTIAL CASHBACK</Text>
            <Text style={styles.potentialValue}>
              ₹{Math.round(summary.potential).toLocaleString('en-IN')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button title="Read recent SMS" color={c.earn} onPress={readSms} />
        <View style={styles.actionGap} />
        <Button title="Change cards" color={c.muted} onPress={openPicker} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        style={{ width: '100%', marginTop: 8 }}
        ItemSeparatorComponent={() => <View style={styles.hairline} />}
        renderItem={({ item }) => {
          const verdict = (() => {
            if (item.top) {
              const usedPct = item.top.cap != null ? item.top.used / item.top.cap : 0;
              const vColor = item.top.cap != null
                ? (usedPct >= 1 ? c.danger : usedPct >= 0.7 ? c.warn : c.earn)
                : c.earn;
              return (
                <View>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>
                      {item.cat || 'UPI'}
                      {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                    </Text>
                    <Text style={[styles.verdict, { color: vColor }]}>
                      ✓ {shortName(item.top.card.name)} — {item.top.reward.netPct}%
                    </Text>
                  </View>
                  {item.top.cap != null ? (
                    <View style={styles.meter}>
                      <View
                        style={[styles.meterFill, {
                          width: `${Math.min(100, usedPct * 100)}%`,
                          backgroundColor: vColor,
                        }]}
                      />
                      <Text style={styles.meterLabel}>
                        ₹{item.top.used}/{item.top.cap} used
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            }
            if (item.excluded) {
              return (
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.cat || 'UPI'}
                    {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                  </Text>
                  <Text style={[styles.verdict, { color: c.warn }]}>
                    {shortName(item.excluded.card.name)} — needs ₹{item.excluded.reward.minTxnRs} min
                  </Text>
                </View>
              );
            }
            // Unmappable (UPI person pays) or no reward row — quiet, honest.
            return (
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {item.cat || 'UPI'}
                  {item.t.cardLast4 ? ' · ' + item.t.cardLast4 : ''}
                </Text>
                <Text style={[styles.verdict, { color: c.muted }]}>
                  {item.upi ? 'not a card spend' : 'no reward row'}
                </Text>
              </View>
            );
          })();
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.merchant} numberOfLines={1}>
                  {item.t.merchant || '(upi)'}
                </Text>
                <Text style={styles.amt}>₹{item.t.amount.toLocaleString('en-IN')}</Text>
              </View>
              {verdict}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.status}>
            {wallet.length
              ? 'No transactions yet — read SMS to scan your bank alerts.'
              : 'Add your cards first — they power every recommendation.'}
          </Text>
        }
      />

      <Modal visible={pickerOpen} animationType="slide">
        <View style={styles.pickerContainer}>
          <Text style={styles.logo}>YOUR CARDS</Text>
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
            data={cardsData.cards.filter(
              (c) => !query || c.name.toLowerCase().includes(query.toLowerCase())
            )}
            keyExtractor={(c) => c.cardKey}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.hairline} />}
            renderItem={({ item }) => {
              const on = selected[item.cardKey] !== undefined;
              return (
                <View style={[styles.cardRow, on && { borderLeftColor: c.earn }]}>
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
                  <Button
                    title={on ? 'Remove' : 'Add'}
                    color={on ? c.danger : c.earn}
                    onPress={() =>
                      setSelected((s) => {
                        const n = { ...s };
                        if (s[item.cardKey] !== undefined) delete n[item.cardKey];
                        else n[item.cardKey] = '';
                        return n;
                      })
                    }
                  />
                </View>
              );
            }}
          />
          <Button title={`Save ${count} card${count === 1 ? '' : 's'}`} color={c.earn} onPress={saveWallet} />
          <Button title="Cancel" color={c.muted} onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>

      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
    header: { marginBottom: 14 },
    logo: {
      fontSize: 13, fontWeight: '800', letterSpacing: 2, color: c.text,
    },
    sub: { fontSize: 13, color: c.sub, marginTop: 4 },
    potentialRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
      marginTop: 12, backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.hairline,
    },
    potentialLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: c.sub },
    potentialValue: { fontSize: 22, fontWeight: '800', color: c.earn, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', marginBottom: 4 },
    actionGap: { width: 10 },
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
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
      marginTop: 3,
    },
    meta: { fontSize: 11, color: c.sub, marginTop: 2, letterSpacing: 0.3 },
    verdict: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    hairline: { height: 1, backgroundColor: c.hairline },
    meter: { marginTop: 8, backgroundColor: c.meterTrack, borderRadius: 3, overflow: 'hidden' },
    meterFill: { height: 6 },
    meterLabel: { fontSize: 11, color: c.sub, marginTop: 3 },
    pickerContainer: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
    search: {
      backgroundColor: c.surface, borderRadius: 10, padding: 12, marginVertical: 12,
      borderWidth: 1, borderColor: c.hairline, color: c.text, fontSize: 15,
    },
    cardRow: {
      paddingVertical: 12, paddingHorizontal: 2,
      borderLeftWidth: 3, borderLeftColor: 'transparent',
    },
    cardName: { fontSize: 14, fontWeight: '600', color: c.text },
    cardSub: { fontSize: 11, color: c.sub, marginTop: 2 },
    last4: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: 8,
      padding: 8, marginTop: 8, fontSize: 13, color: c.text,
    },
  });
