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
        const keys = JSON.parse(raw);
        setWallet(cardsData.cards.filter((c) => keys.includes(c.cardKey)));
        setSelected(Object.fromEntries(keys.map((k) => [k, true])));
      } else {
        setPickerOpen(true); // first run: pick cards
      }
    });
  }, []);

  const openPicker = () => {
    setSelected(Object.fromEntries(wallet.map((c) => [c.cardKey, true])));
    setQuery('');
    setPickerOpen(true);
  };

  const saveWallet = () => {
    const cards = cardsData.cards.filter((c) => selected[c.cardKey]);
    setWallet(cards);
    AsyncStorage.setItem(WALLET_KEY, JSON.stringify(cards.map((c) => c.cardKey)));
    setPickerOpen(false);
  };

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
  // UPI spends land on the UPI-scoped row that actually earns.
  const spent = useMemo(() => {
    const m = {};
    for (const t of txns) {
      const action = actionFor(merchantCategory(t.merchant));
      if (!action) continue;
      const app = action.apps[0];
      for (const c of wallet) {
        const r = rewardFor(c, action, app);
        if (r && r.monthlyCapRs != null) {
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
      const picks = recommend(wallet, action, app, spent);
      return { t, cat, upi: !cat, top: picks[0] };
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
              {item.cat || 'UPI'} · card {item.t.cardLast4 || '?'}
            </Text>
            {item.top ? (
              <View>
                <Text style={styles.rec}>
                  ✓ {item.top.card.name} — {item.top.reward.netPct}%
                </Text>
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
              const on = !!selected[item.cardKey];
              return (
                <View style={[styles.cardRow, on && styles.cardRowOn]}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardSub}>
                    {item.issuer} · {item.tier}
                    {item.lifetimeFree ? '' : ` · ₹${item.annualFeeRs}/yr`}
                  </Text>
                  <Button
                    title={on ? 'Remove' : 'Add'}
                    onPress={() =>
                      setSelected((s) => ({ ...s, [item.cardKey]: !s[item.cardKey] }))
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
});
