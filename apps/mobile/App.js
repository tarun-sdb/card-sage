import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import cardsData from '../../src/data/cards.json';
import { ACTIONS } from '../../src/engine/actions';
import { recommend } from '../../src/engine/recommend';

export default function App() {
  const [actionId] = useState(ACTIONS[0].id);
  const action = ACTIONS.find((a) => a.id === actionId);
  const app = action.apps[0];

  // Bootstrap wallet: Ultimo, so first screen shows a real rec.
  const wallet = useMemo(
    () => cardsData.cards.filter((c) => c.cardKey === 'hdfc-phonepe-ultimo'),
    []
  );

  const picks = useMemo(() => recommend(wallet, action, app, {}), [wallet, action, app]);

  useEffect(() => {
    console.log('engine loaded:', cardsData.cards.length, 'cards,', ACTIONS.length, 'actions');
    console.log('top pick:', picks[0]?.card.name, picks[0]?.reward.netPct + '%');
  }, [picks]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Card Sage</Text>
      <Text style={styles.sub}>{action.label} via {app.label}</Text>
      <Text style={styles.pick}>
        {picks[0] ? `${picks[0].card.name} — ${picks[0].reward.netPct}%` : 'no pick'}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 14, color: '#666' },
  pick: { fontSize: 16, color: '#2f6fed', fontWeight: '600' },
});
