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

// Taught bank → cardKey mappings ("which card was this?" picks).
const LEARNT_KEY = 'card-sage:learnt';

export async function loadLearnt() {
  try {
    const raw = await AsyncStorage.getItem(LEARNT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLearnt(map) {
  return AsyncStorage.setItem(LEARNT_KEY, JSON.stringify(map)).catch(() => {});
}
