import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Button, FlatList, Modal, PermissionsAndroid, Platform, StyleSheet, Text, TextInput, View,
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

export default function App() {
  const [txns, setTxns] = useState([]);
  const [status, setStatus] = useState('idle');
  const [wallet, setWallet] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});

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

  const count = Object.keys(selected).filter((k) => selected[k]).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Card Sage</Text>
      <Text style={styles.sub}>
        SMS card tracker · {wallet.length ? wallet.length + ' cards' : 'no cards picked'}
      </Text>
      <Button title="Change cards" onPress={openPicker} />
      <Button title="Read recent SMS" onPress={readSms} />
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        style={{ width: '100%', marginTop: 12 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.merchant}>
              {item.t.merchant || '(upi)'}{' '}
              <Text style={styles.amt}>₹{item.t.amount.toLocaleString('en-IN')}</Text>
            </Text>
            <Text style={styles.meta}>
              {item.cat || 'UPI'} ·{' '}
              {item.matched
                ? item.matched.name.replace(/ (Credit|Debit|Charge) Card$/, '')
                : 'card ' + (item.t.cardLast4 || '?')}
            </Text>
            {item.top ? (
              <View>
                <Text style={styles.rec}>
                  ✓ {item.top.card.name} — {item.top.reward.netPct}%
                </Text>
                {item.best && item.best.card.cardKey !== item.top.card.cardKey ? (
                  <Text style={styles.best}>
                    best: {item.best.card.name} — {item.best.reward.netPct}%
                  </Text>
                ) : null}
                {item.top.cap != null ? (
                  <View style={styles.meter}>
                    <View
                      style={[styles.meterFill, {
                        width: `${Math.min(100, (item.top.used / item.top.cap) * 100)}%`,
                      }]}
                    />
                    <Text style={styles.meterLabel}>
                      ₹{item.top.used}/{item.top.cap} used
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : item.excluded ? (
              <Text style={styles.norec}>
                ₹{item.t.amount} txn — {item.excluded.card.name} needs min ₹
                {item.excluded.reward.minTxnRs} cashback txn
              </Text>
            ) : (
              <Text style={styles.norec}>
                {item.upi ? 'no UPI cashback card' : 'no reward row'}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.status}>No transactions yet. Tap read SMS.</Text>
        }
      />

      <Modal visible={pickerOpen} animationType="slide">
        <View style={styles.pickerContainer}>
          <Text style={styles.title}>Your cards</Text>
          <Text style={styles.sub}>Pick every card you own. Recommendations use only these.</Text>
          <TextInput
            style={styles.search}
            placeholder="Search: ultimo, amazon, swiggy…"
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
            renderItem={({ item }) => {
              const on = selected[item.cardKey] !== undefined;
              return (
                <View style={[styles.cardRow, on && styles.cardRowOn]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardSub}>
                      {item.issuer} · {item.tier}
                      {item.lifetimeFree ? '' : ` · ₹${item.annualFeeRs}/yr`}
                    </Text>
                    {on ? (
                      <TextInput
                        style={styles.last4}
                        placeholder="last 4 digits of your card (optional — matches SMS)"
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
          <Button title={`Save ${count} card${count === 1 ? '' : 's'}`} onPress={saveWallet} />
          <Button title="Cancel" onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9', padding: 20, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 14, color: '#666', marginBottom: 12 },
  status: { fontSize: 13, color: '#444', marginTop: 10 },
  row: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#2f6fed',
  },
  merchant: { fontSize: 15, fontWeight: '600' },
  amt: { color: '#1e7d32' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  rec: { fontSize: 13, color: '#2f6fed', marginTop: 4, fontWeight: '600' },
  best: { fontSize: 12, color: '#1e7d32', marginTop: 2 },
  norec: { fontSize: 13, color: '#a05c00', marginTop: 4 },
  meter: { marginTop: 6, backgroundColor: '#e8e8ee', borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: 6, backgroundColor: '#2f6fed' },
  meterLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  pickerContainer: { flex: 1, backgroundColor: '#f6f7f9', padding: 20, paddingTop: 60 },
  search: {
    backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#ddd',
  },
  cardRow: {
    backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardRowOn: { borderLeftWidth: 3, borderLeftColor: '#2f6fed' },
  cardName: { fontSize: 14, fontWeight: '600', flex: 1 },
  cardSub: { fontSize: 11, color: '#888', flex: 1 },
  last4: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 6,
    padding: 6, marginTop: 6, fontSize: 13,
  },
});
