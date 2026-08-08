import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Button, FlatList, PermissionsAndroid, Platform, StyleSheet, Text, View,
} from 'react-native';
import cardsData from '../../src/data/cards.json';
import { ACTIONS } from '../../src/engine/actions';
import { recommend } from '../../src/engine/recommend';
import { parseSms } from '../../src/engine/sms';
import { merchantCategory } from '../../src/engine/merchants';
import SmsReader from './modules/sms-reader';

// Bootstrap: Ultimo card so first run shows real recs. Replace with wallet picker later.
const BOOTSTRAP_WALLET = ['hdfc-phonepe-ultimo'];

export default function App() {
  const [txns, setTxns] = useState([]);
  const [status, setStatus] = useState('idle');

  const readSms = async () => {
    if (Platform.OS !== 'android') {
      setStatus('SMS read is Android-only.');
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
      console.log('[card-sage] parsed merchants:', JSON.stringify(parsed.map((t) => t.merchant)));
      setTxns(parsed);
      setStatus(`Parsed ${parsed.length} card transactions from ${messages.length} messages.`);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

  const wallet = useMemo(
    () => cardsData.cards.filter((c) => BOOTSTRAP_WALLET.includes(c.cardKey)),
    []
  );

  const rows = useMemo(() => {
    // For each parsed txn: map merchant->category, find best card rec.
    return txns.slice(0, 30).map((t) => {
      const cat = merchantCategory(t.merchant);
      const action = cat
        ? ACTIONS.find((a) => a.category === cat)
        : null;
      const app = action?.apps[0];
      const picks = action ? recommend(wallet, action, app, {}) : [];
      return { t, cat, action, app, top: picks[0] };
    });
  }, [txns, wallet]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Card Sage</Text>
      <Text style={styles.sub}>SMS card tracker · Android</Text>
      <Button title="Read recent SMS" onPress={readSms} />
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        style={{ width: '100%', marginTop: 12 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.merchant}>
              {item.t.merchant || '(unknown merchant)'}{' '}
              <Text style={styles.amt}>₹{item.t.amount.toLocaleString('en-IN')}</Text>
            </Text>
            <Text style={styles.meta}>
              {item.cat || 'unmapped'} · card {item.t.cardLast4 || '?'}
            </Text>
            {item.top ? (
              <Text style={styles.rec}>
                ✓ {item.top.card.name} — {item.top.reward.netPct}%
              </Text>
            ) : (
              <Text style={styles.norec}>
                {item.cat ? 'no reward row' : 'unknown category — set manually'}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.status}>No transactions yet. Tap read SMS.</Text>
        }
      />
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
});
