import AsyncStorage from '@react-native-async-storage/async-storage';
import { isBillPayment } from '../../../src/engine/sms';

const TXNS_KEY = 'card-sage:txns';
const LAST_MAX_DATE_KEY = 'card-sage:lastMaxDate';
const SCAN_META_KEY = 'card-sage:scanMeta';
const LEARNT_KEY = 'card-sage:learnt';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadTxns() {
  try {
    const raw = await AsyncStorage.getItem(TXNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTxns(txns) {
  return AsyncStorage.setItem(TXNS_KEY, JSON.stringify(txns)).catch(() => {});
}

export async function getLastProcessedMaxDate() {
  try {
    const raw = await AsyncStorage.getItem(LAST_MAX_DATE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function updateLastProcessedMaxDate(maxDate) {
  return AsyncStorage.setItem(LAST_MAX_DATE_KEY, String(maxDate)).catch(() => {});
}

// Freshness: when the last SMS refresh landed + whether it succeeded.
// Ledger header renders "as of …" from this; failures keep the old stamp.
export async function getScanMeta() {
  try {
    const raw = await AsyncStorage.getItem(SCAN_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveScanMeta(meta) {
  return AsyncStorage.setItem(SCAN_META_KEY, JSON.stringify(meta)).catch(() => {});
}

function txnKey(t) {
  return `${t.date}|${t.amount}|${t.cardLast4}|${t.merchant}`;
}

export async function mergeAndPurge(existing, newTxns) {
  // One-time sweep: bill-payment rows stored before the parser gate.
  const billed = (existing || []).filter((t) => !(t.raw && isBillPayment(t.raw)));
  const seen = new Set(billed.map(txnKey));
  const merged = [...billed];
  let newMax = 0;
  for (const t of newTxns) {
    const k = txnKey(t);
    if (!seen.has(k)) {
      merged.push(t);
      seen.add(k);
    }
    if (t.date > newMax) newMax = t.date;
  }
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  // Ledger renders newest-first (rows slice + cap pools assume it).
  // Incremental merges append — sort here so latest txns stay visible.
  const purged = merged
    .filter((t) => t.date >= cutoff)
    .sort((a, b) => b.date - a.date);
  const now = Date.now();
  const maxDate = Math.max(...purged.map((t) => t.date), 0);
  await saveTxns(purged);
  if (maxDate > 0 && maxDate <= now) await updateLastProcessedMaxDate(maxDate);
  return purged;
}

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