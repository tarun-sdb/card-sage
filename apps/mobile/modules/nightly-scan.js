import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage txn ledger. App.js mount/resume scans write it, this restores
// it. Background nightly scan was cut — resume scan covers the gap.
const TXNS_KEY = 'card-sage:txns';

export async function loadTxns() {
  try {
    const raw = await AsyncStorage.getItem(TXNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
